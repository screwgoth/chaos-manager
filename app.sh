#!/usr/bin/env bash
#
# C.H.A.O.S — application control script.
#
#   ./app.sh start | stop | restart | status | logs | migrate | backup | restore | purge | reset
#
# It is a thin, deliberate wrapper around `docker compose`. It does not hide what it runs: every
# command it issues is echoed first, so this script stays a convenience rather than a black box you
# have to reverse-engineer during an incident.
#
# Two things it does that a raw compose command does not:
#   • it refuses destructive operations unless you confirm them by typing the word (purge, reset,
#     restore), because `down -v` deletes the database with no prompt of its own;
#   • it reads POSTGRES_USER / POSTGRES_DB from inside the db container rather than from the host
#     shell, so no credential is ever expanded into your shell history.
#
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

BACKUP_DIR="${CHAOS_BACKUP_DIR:-$SCRIPT_DIR/backups}"

# ------------------------------------------------------------------------------------------------
# Output helpers
# ------------------------------------------------------------------------------------------------
if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  C_RESET=$'\033[0m'; C_BOLD=$'\033[1m'; C_DIM=$'\033[2m'
  C_RED=$'\033[31m'; C_GREEN=$'\033[32m'; C_YELLOW=$'\033[33m'; C_CYAN=$'\033[36m'
else
  C_RESET=''; C_BOLD=''; C_DIM=''; C_RED=''; C_GREEN=''; C_YELLOW=''; C_CYAN=''
fi

info()  { printf '%s\n' "${C_CYAN}==>${C_RESET} $*"; }
ok()    { printf '%s\n' "${C_GREEN}  ok${C_RESET} $*"; }
warn()  { printf '%s\n' "${C_YELLOW}  !!${C_RESET} $*" >&2; }
fail()  { printf '%s\n' "${C_RED}error:${C_RESET} $*" >&2; exit 1; }

# Echo a command, then run it. Everything that changes state goes through this.
run() {
  printf '%s\n' "${C_DIM}\$ $*${C_RESET}"
  "$@"
}

# ------------------------------------------------------------------------------------------------
# Options
# ------------------------------------------------------------------------------------------------
NO_TLS="${CHAOS_NO_TLS:-0}"     # 1 = add the no-TLS override (local testing only)
ASSUME_YES=0                    # 1 = skip confirmation prompts (for automation)
BUILD=0                         # start: build images before starting
NO_CACHE=0                      # start: build without the layer cache
FOLLOW=0                        # logs: follow
TAIL_LINES=200                  # logs: how much history

COMMAND=''
ARGS=()

usage() {
  cat <<'EOF'
C.H.A.O.S — application control script

Usage: ./app.sh <command> [options]

Commands
  start                 Start the stack (db, app, proxy). Waits until the app is healthy.
  stop                  Stop the containers. Data, volumes and certificates are kept.
  restart               Stop, then start. Use after editing .env.
  status                Containers, health, database, and migration state.
  logs [service]        Show logs. Default: all services. e.g. ./app.sh logs app -f
  migrate               Apply pending database migrations.
  backup [file]         Dump the database, gzipped, into ./backups (or CHAOS_BACKUP_DIR).
  restore <file>        Restore a dump produced by `backup`. OVERWRITES the current database.
  purge                 Stop and DESTROY all containers, volumes and data. Irreversible.
  reset                 Purge, then start from scratch with an empty database.

Options
  --no-tls              Use docker-compose.no-tls.yml as well: no proxy, app published on
                        :3000 over plain HTTP. LOCAL TESTING ONLY. (env: CHAOS_NO_TLS=1)
  --build               start/restart/reset: build images first.
  --no-cache            start/restart/reset: build without the layer cache (implies --build).
  -f, --follow          logs: follow the output.
  -n, --tail <n>        logs: lines of history to show (default 200).
  -y, --yes             Do not ask for confirmation. Required for purge/reset/restore
                        when there is no terminal to prompt on.
  -h, --help            This text.

Examples
  ./app.sh start --no-tls          # local stack, no TLS, app on http://localhost:3000
  ./app.sh status                  # is it up, is the DB reachable, are migrations current
  ./app.sh backup                  # ./backups/chaos-20260806T054500Z.sql.gz
  ./app.sh restore backups/chaos-20260806T054500Z.sql.gz
  ./app.sh purge -y                # scripted teardown, no prompt

Data safety
  stop / restart      keep everything.
  purge / reset       DELETE the database volume and the TLS certificates. Take a backup first;
                      both commands offer to do it for you.
EOF
}

parse_args() {
  while [ $# -gt 0 ]; do
    case "$1" in
      --no-tls)          NO_TLS=1 ;;
      --build)           BUILD=1 ;;
      --no-cache)        NO_CACHE=1; BUILD=1 ;;
      -f|--follow)       FOLLOW=1 ;;
      -n|--tail)         [ $# -ge 2 ] || fail "--tail needs a value"; TAIL_LINES="$2"; shift ;;
      -y|--yes)          ASSUME_YES=1 ;;
      -h|--help|help)    usage; exit 0 ;;
      -*)                fail "unknown option: $1 (try ./app.sh --help)" ;;
      *)
        if [ -z "$COMMAND" ]; then COMMAND="$1"; else ARGS+=("$1"); fi
        ;;
    esac
    shift
  done
}

# ------------------------------------------------------------------------------------------------
# Environment checks
# ------------------------------------------------------------------------------------------------
COMPOSE=()

require_compose() {
  [ ${#COMPOSE[@]} -eq 0 ] || return 0

  if docker compose version >/dev/null 2>&1; then
    COMPOSE=(docker compose)
  elif command -v docker-compose >/dev/null 2>&1; then
    COMPOSE=(docker-compose)
  else
    fail "neither 'docker compose' nor 'docker-compose' is available. Install Docker Compose."
  fi

  docker info >/dev/null 2>&1 || fail "the Docker daemon is not reachable. Is Docker running?"

  COMPOSE+=(-f docker-compose.yml)
  if [ "$NO_TLS" = 1 ]; then
    [ -f docker-compose.no-tls.yml ] || fail "docker-compose.no-tls.yml not found"
    COMPOSE+=(-f docker-compose.no-tls.yml)
    warn "no-TLS mode: credentials cross the wire in cleartext and the app port is published."
    warn "Use it for local testing only, never for real data."
  fi
}

require_env() {
  [ -f .env ] && return 0
  fail ".env not found. Create it first:

    cp .env.example .env
    \$EDITOR .env      # set POSTGRES_PASSWORD, CHAOS_HOSTNAME, INITIAL_ADMIN_*

.env is gitignored and must never be committed."
}

dc() { run "${COMPOSE[@]}" "$@"; }
# Quiet variant for probing: no echo, no failure propagation to the caller's `set -e`.
dcq() { "${COMPOSE[@]}" "$@" 2>/dev/null; }

# Is a service's container running right now?
service_running() {
  local id
  id="$(dcq ps -q "$1" || true)"
  [ -n "$id" ] || return 1
  [ "$(docker inspect -f '{{.State.Running}}' "$id" 2>/dev/null || echo false)" = 'true' ]
}

# Can we actually ask a human? `[ -r /dev/tty ]` is not enough — the device node exists and looks
# readable inside CI runners and agent harnesses where OPENING it fails, which produced a raw
# "No such device or address" instead of a clear refusal. So try to open it.
can_prompt() {
  [ -t 0 ] && return 0
  ( exec </dev/tty ) 2>/dev/null
}

# Read one line from the terminal, wherever it is.
read_line() {
  if [ -t 0 ]; then read -r "$1"; else read -r "$1" < /dev/tty; fi
}

confirm() {
  local prompt="$1" expected="$2" answer=''
  if [ "$ASSUME_YES" = 1 ]; then
    info "--yes given: proceeding without confirmation."
    return 0
  fi
  can_prompt \
    || fail "$prompt
Refusing to continue without confirmation, and there is no terminal to ask on.
Pass --yes if you really mean it."
  printf '%s\n' "${C_YELLOW}${C_BOLD}$prompt${C_RESET}"
  printf '%s' "Type ${C_BOLD}${expected}${C_RESET} to continue: "
  read_line answer || fail 'aborted (no input).'
  [ "$answer" = "$expected" ] || fail "aborted (you typed '${answer}')."
}

# yes/no question; returns 0 for yes. Defaults to NO when unattended.
ask_yes_no() {
  local prompt="$1" answer=''
  [ "$ASSUME_YES" = 1 ] && return 1
  can_prompt || return 1
  printf '%s' "$prompt [y/N]: "
  read_line answer || return 1
  case "$answer" in [yY]|[yY][eE][sS]) return 0 ;; *) return 1 ;; esac
}

# ------------------------------------------------------------------------------------------------
# Database helpers
#
# Every one of these runs INSIDE the db container and expands $POSTGRES_USER / $POSTGRES_DB there,
# so the credentials never appear in the host shell or its history.
# ------------------------------------------------------------------------------------------------
db_exec() {
  # db_exec <sh -c script>. Uses -T: no TTY, safe in pipelines.
  "${COMPOSE[@]}" exec -T db sh -c "$1"
}

db_ready() { db_exec 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" -q' >/dev/null 2>&1; }

db_query() {
  # Single value, no headers, no alignment.
  db_exec "psql -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -tAc \"$1\"" 2>/dev/null | tr -d '\r'
}

# ------------------------------------------------------------------------------------------------
# Commands
# ------------------------------------------------------------------------------------------------
cmd_start() {
  require_env; require_compose

  if [ "$NO_CACHE" = 1 ]; then
    info "Building images (no cache)"
    dc build --no-cache
  elif [ "$BUILD" = 1 ]; then
    info "Building images"
    dc build
  fi

  info "Starting the stack"
  # --build on first run only: compose builds the app image if it does not exist yet, so a fresh
  # clone works without a separate build step.
  dc up -d
  wait_for_health
  print_endpoint
}

wait_for_health() {
  local deadline=$((SECONDS + 180)) state=''
  info "Waiting for the app to become healthy (up to 180s)"
  while [ $SECONDS -lt $deadline ]; do
    local id
    id="$(dcq ps -q app || true)"
    if [ -n "$id" ]; then
      state="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$id" 2>/dev/null || echo unknown)"
      case "$state" in
        healthy)  ok "app is healthy"; return 0 ;;
        running)  ok "app is running (no healthcheck reported)"; return 0 ;;
        exited|dead)
          warn "the app container exited. Last 40 log lines:"
          dcq logs --tail 40 app || true
          fail "the app failed to start. See the log above, or run: ./app.sh logs app"
          ;;
      esac
    fi
    sleep 3
  done
  warn "the app is still '$state' after 180s. Check: ./app.sh logs app"
  return 1
}

print_endpoint() {
  if [ "$NO_TLS" = 1 ]; then
    ok "Open http://localhost:3000  ${C_DIM}(no TLS — local testing only)${C_RESET}"
  else
    local host='localhost'
    # Read only the hostname from .env; it is not a secret.
    if [ -f .env ]; then
      host="$(sed -n 's/^[[:space:]]*CHAOS_HOSTNAME=//p' .env | tail -1 | tr -d "\"' \r")"
      [ -n "$host" ] || host='localhost'
    fi
    ok "Open https://${host}"
  fi
}

cmd_stop() {
  require_compose
  info "Stopping the containers (data, volumes and certificates are kept)"
  dc stop
  ok "stopped. Start again with: ./app.sh start"
}

cmd_restart() {
  require_env; require_compose
  if [ "$NO_CACHE" = 1 ]; then
    info "Rebuilding images (no cache)"; dc build --no-cache
  elif [ "$BUILD" = 1 ]; then
    info "Rebuilding images"; dc build
  fi
  info "Recreating the containers"
  # `up -d` rather than `restart`: it picks up changes to .env and to the compose file, which
  # `restart` does not.
  dc up -d
  wait_for_health
  print_endpoint
}

cmd_logs() {
  require_compose
  local args=(logs "--tail=$TAIL_LINES")
  [ "$FOLLOW" = 1 ] && args+=(-f)
  [ ${#ARGS[@]} -gt 0 ] && args+=(${ARGS[@]+"${ARGS[@]}"})
  dc "${args[@]}"
}

cmd_status() {
  require_compose

  info "Containers"
  dcq ps || true
  echo

  info "Application"
  if service_running app; then
    local body
    # Ask the app itself, from inside the network. In the TLS topology port 3000 is not published,
    # so probing from the host would report a false negative.
    body="$("${COMPOSE[@]}" exec -T app node -e "
      require('http').get('http://127.0.0.1:3000/health', res => {
        let b = '';
        res.on('data', c => (b += c));
        res.on('end', () => { process.stdout.write(res.statusCode + ' ' + b); });
      }).on('error', e => { process.stdout.write('unreachable: ' + e.message); process.exitCode = 1; });
    " 2>/dev/null || true)"
    if [ -n "$body" ]; then
      case "$body" in
        200*) ok "/health -> $body" ;;
        *)    warn "/health -> ${body:-no response}" ;;
      esac
    else
      warn "the app container is running but /health did not answer"
    fi
  else
    warn "the app container is not running"
  fi
  echo

  info "Database"
  if service_running db; then
    if db_ready; then
      ok "accepting connections"
      local version size
      version="$(db_query 'SHOW server_version' || true)"
      size="$(db_query 'SELECT pg_size_pretty(pg_database_size(current_database()))' || true)"
      [ -n "$version" ] && ok "PostgreSQL $version, database size ${size:-unknown}"
      status_migrations
      status_counts
    else
      warn "the container is up but PostgreSQL is not accepting connections yet"
    fi
  else
    warn "the db container is not running"
  fi
}

status_migrations() {
  local applied_raw applied_count pending=()
  # kysely records applied migrations in kysely_migration. Absent table = nothing applied yet.
  applied_raw="$(db_query "SELECT name FROM kysely_migration ORDER BY name" || true)"
  if [ -z "$applied_raw" ]; then
    warn "no migrations applied yet (kysely_migration is empty or absent). Run: ./app.sh migrate"
    return 0
  fi
  applied_count="$(printf '%s\n' "$applied_raw" | grep -c . || true)"

  local f name
  for f in backend/migrations/*.ts; do
    [ -e "$f" ] || continue
    name="$(basename "$f" .ts)"
    printf '%s\n' "$applied_raw" | grep -qx "$name" || pending+=("$name")
  done

  if [ ${#pending[@]} -eq 0 ]; then
    ok "migrations up to date (${applied_count} applied)"
  else
    warn "${#pending[@]} pending migration(s): ${pending[*]} — run: ./app.sh migrate"
  fi
}

status_counts() {
  # A one-line sense of whether this is a seeded, populated or empty database. Best effort: on a
  # database with no schema yet these queries fail and are simply skipped.
  local people projects assignments
  people="$(db_query 'SELECT count(*) FROM member' || true)"
  projects="$(db_query 'SELECT count(*) FROM project' || true)"
  assignments="$(db_query 'SELECT count(*) FROM assignment' || true)"
  if [ -n "$people$projects$assignments" ]; then
    ok "data: members ${people:-?}, projects ${projects:-?}, assignments ${assignments:-?}"
  fi
}

cmd_migrate() {
  require_env; require_compose

  service_running db || fail "the database is not running. Start it first: ./app.sh start"
  db_ready || fail "PostgreSQL is not accepting connections yet. Try again in a moment."

  # The app runs migrations itself before it listens, so this command exists for the case where you
  # want to migrate WITHOUT starting the app — or to confirm there is nothing pending.
  info "Applying pending migrations"
  if service_running app; then
    dc exec -T app node dist/src/shared/repository/migrate.js
  else
    # --no-deps: the database is already up; do not let compose start the proxy as well.
    dc run --rm --no-deps app node dist/src/shared/repository/migrate.js
  fi
  ok "migration runner finished. Verify with: ./app.sh status"
}

cmd_backup() {
  require_compose
  service_running db || fail "the database is not running. Start it first: ./app.sh start"
  db_ready || fail "PostgreSQL is not accepting connections yet."

  local target
  if [ ${#ARGS[@]} -gt 0 ]; then
    target="${ARGS[0]}"
  else
    mkdir -p "$BACKUP_DIR"
    target="$BACKUP_DIR/chaos-$(date -u +%Y%m%dT%H%M%SZ).sql.gz"
  fi
  local dir
  dir="$(dirname "$target")"
  mkdir -p "$dir"

  info "Dumping the database to $target"
  # --clean --if-exists so the dump can be restored over an existing database without a purge.
  # Written to a .part file first: an interrupted dump must not be mistaken for a usable backup.
  if ! db_exec 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists' | gzip > "$target.part"; then
    rm -f "$target.part"
    fail "pg_dump failed; no backup was written."
  fi
  mv "$target.part" "$target"

  # Prove it is a real dump rather than an empty file or an error page.
  gzip -t "$target" 2>/dev/null || { rm -f "$target"; fail "the dump is not valid gzip; removed."; }
  gunzip -c "$target" | head -40 | grep -q 'PostgreSQL database dump' \
    || warn "the dump does not carry the usual pg_dump header — inspect it before relying on it."

  ok "$(du -h "$target" | cut -f1) written to $target"
  ok "restore with: ./app.sh restore $target"
}

cmd_restore() {
  require_compose
  [ ${#ARGS[@]} -gt 0 ] || fail "usage: ./app.sh restore <file.sql.gz|file.sql>"
  local src="${ARGS[0]}"
  [ -f "$src" ] || fail "no such file: $src"

  service_running db || fail "the database is not running. Start it first: ./app.sh start"
  db_ready || fail "PostgreSQL is not accepting connections yet."

  confirm "Restoring $src OVERWRITES the current database. Everything in it now is replaced." 'restore'

  # The app is stopped for the duration: restoring under a live app means requests hitting tables
  # that are being dropped and recreated.
  local app_was_running=0
  if service_running app; then
    app_was_running=1
    info "Stopping the app for the restore"
    dc stop app
  fi

  info "Restoring from $src"
  local rc=0
  case "$src" in
    *.gz) gunzip -c "$src" | "${COMPOSE[@]}" exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -q -o /dev/null' || rc=$? ;;
    *)    "${COMPOSE[@]}" exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -q -o /dev/null' < "$src" || rc=$? ;;
  esac

  if [ "$app_was_running" = 1 ]; then
    info "Starting the app again"
    dc up -d app
  fi

  [ "$rc" -eq 0 ] || fail "psql exited with $rc — the restore did NOT complete cleanly. The database may be in a partial state; restore a known-good dump."
  ok "restored. Check it with: ./app.sh status"
}

cmd_purge() {
  require_compose
  cat <<EOF
${C_RED}${C_BOLD}This DESTROYS:${C_RESET}
  • the PostgreSQL data volume — every member, project, assignment and account
  • the Caddy volumes — the TLS certificates and ACME state
  • the containers and the network
There is no undo.
EOF
  if service_running db && db_ready; then
    if ask_yes_no "Take a backup first?"; then
      ARGS=()
      cmd_backup
    fi
  fi
  confirm 'Purge all containers, volumes and data?' 'purge'

  info "Tearing the stack down, volumes included"
  dc down -v --remove-orphans
  ok "purged. Nothing of this stack remains except your .env and any backups."
}

cmd_reset() {
  require_env; require_compose
  info "Reset = purge, then start from an empty database."
  cmd_purge
  echo
  info "Starting from scratch"
  cmd_start
  ok "reset complete. The bootstrap administrator from .env was recreated (the seed runs only on an"
  ok "empty database), so sign in with INITIAL_ADMIN_USERNAME / INITIAL_ADMIN_PASSWORD."
}

# ------------------------------------------------------------------------------------------------
# Dispatch
# ------------------------------------------------------------------------------------------------
parse_args "$@"

case "${COMMAND:-}" in
  start)    cmd_start ;;
  stop)     cmd_stop ;;
  restart)  cmd_restart ;;
  status)   cmd_status ;;
  logs)     cmd_logs ;;
  migrate)  cmd_migrate ;;
  backup)   cmd_backup ;;
  restore)  cmd_restore ;;
  purge)    cmd_purge ;;
  reset)    cmd_reset ;;
  '')       usage; exit 1 ;;
  *)        printf '%s\n\n' "${C_RED}error:${C_RESET} unknown command: $COMMAND" >&2; usage >&2; exit 1 ;;
esac
