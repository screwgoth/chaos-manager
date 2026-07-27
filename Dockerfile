# ==============================================================================
# C.H.A.O.S — three-stage build (deployment-architecture §3)
#
# Built ON THE DEPLOYMENT HOST from source (Q3:A): no registry, no CI. That is why the stages are
# ordered to cache well on a machine that rebuilds after a `git pull` — dependency installs come
# before source copies, so editing a component does not reinstall node_modules.
#
# The runtime image contains NO TypeScript, NO Vite, and no dev dependencies.
# ==============================================================================

# ------------------------------------------------------------------------------
# Stage 1 — frontend build
# ------------------------------------------------------------------------------
FROM node:22-alpine AS frontend-build
WORKDIR /build/frontend

# Manifests first: this layer survives any source-only change.
COPY frontend/package.json frontend/package-lock.json* ./
# `npm ci` when a lockfile exists (reproducible), `npm install` when it does not, so a fresh clone
# without a committed lockfile still builds rather than failing on a missing file.
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

COPY frontend/ ./
RUN npm run build

# ------------------------------------------------------------------------------
# Stage 2 — backend build
# ------------------------------------------------------------------------------
FROM node:22-alpine AS backend-build
WORKDIR /build/backend

COPY backend/package.json backend/package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

COPY backend/ ./
# Emits dist/src/** AND dist/migrations/**: tsconfig includes migrations/ precisely so the compiled
# runtime can load them (a defect found in Step 1 — the migrator resolved a path that only existed
# in the source tree).
RUN npm run build

# ------------------------------------------------------------------------------
# Stage 3 — runtime
# ------------------------------------------------------------------------------
FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production

# Production dependencies only. @node-rs/argon2 ships prebuilt binaries, so no build toolchain is
# needed here — the reason that package was chosen over `argon2`, which needs node-gyp.
COPY backend/package.json backend/package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi \
 && npm cache clean --force

COPY --from=backend-build /build/backend/dist ./dist
# Migrations are copied as COMPILED JavaScript from dist/migrations; the source .ts files are not
# present in the runtime image and would not be loadable without tsx.
COPY --from=frontend-build /build/frontend/dist ./public

# Fastify serves the SPA from here (STATIC_DIR), so there is one process and one port.
ENV STATIC_DIR=/app/public
ENV PORT=3000

# The node image provides an unprivileged `node` user. Running as root in a container that reaches
# a database is an unnecessary blast radius.
USER node

EXPOSE 3000

# No wrapper script and no wait-for-db loop: the app runs migrations itself before listening, and
# compose's healthcheck condition already gates startup on the database being ready.
CMD ["node", "dist/src/server.js"]
