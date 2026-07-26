/**
 * Account-to-member linkage — US-ACC-04, the BR-L series. Step 8.
 *
 * The assertion that matters most is not that linking works — it is that **unlinking a
 * TEAM_MEMBER revokes all their access** (BR-L-04 + BR-R-18). That consequence is invisible from
 * the word "unlink", so it is asserted end to end rather than reasoned about.
 */

import { sql } from 'kysely';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app';
import type { AppConfig } from '../../src/shared/config';
import { createDb, createPool, runMigrations, type Db } from '../../src/shared/repository';
import type { Services } from '../../src/core-domain/services';

const CONNECTION = process.env.TEST_DATABASE_URL;
const describeDb = CONNECTION ? describe : describe.skip;
const PASSWORD = 'link-test-password-long';

function testConfig(): AppConfig {
  return {
    nodeEnv: 'test',
    port: 0,
    logLevel: 'silent',
    databaseUrl: CONNECTION as string,
    session: { cookieName: 'chaos_session', cookieSecure: false, idleMinutes: 30 },
    contractExpiryWarnDays: 30,
    argon2: { memoryKiB: 8192, iterations: 1, parallelism: 1 },
    bootstrap: { adminUsername: null, adminPassword: null },
    staticDir: null,
    import: { maxRows: 2000, maxBytes: 5 * 1024 * 1024 },
  } as AppConfig;
}

describeDb('account-to-member linkage (US-ACC-04)', () => {
  let db: Db;
  let app: FastifyInstance;
  let services: Services;

  let adminCookie: string;
  let orgId: string;
  let adaId: string;
  let graceId: string;
  let adaAccountId: string;
  let secondAccountId: string;

  function cookieFrom(headers: Record<string, unknown>): string {
    const raw = headers['set-cookie'];
    const value = Array.isArray(raw) ? raw[0] : raw;
    return String(value).split(';')[0] as string;
  }

  async function signIn(username: string): Promise<string> {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username, password: PASSWORD },
    });
    if (response.statusCode !== 200) throw new Error(`sign-in failed: ${response.body}`);
    return cookieFrom(response.headers as Record<string, unknown>);
  }

  beforeAll(async () => {
    const pool = createPool(CONNECTION as string);
    db = createDb(pool);
    await sql`drop schema public cascade`.execute(db);
    await sql`create schema public`.execute(db);
    const migration = await runMigrations(db);
    if (migration.error) throw migration.error;

    const built = buildApp({ db, config: testConfig() });
    app = built.app;
    services = built.services;
    await app.ready();

    await services.identity.createAccount(
      { username: 'admin', role: 'ADMIN', homeOrgUnitId: null },
      PASSWORD,
    );
    adminCookie = await signIn('admin');

    const org = await app.inject({
      method: 'POST',
      url: '/api/org-units',
      headers: { cookie: adminCookie },
      payload: { name: 'Engineering', parentOrgUnitId: null },
    });
    orgId = org.json().id;
    services.authorization.setRootOrgUnitIds([orgId]);

    const role = await app.inject({
      method: 'POST',
      url: '/api/reference-data',
      headers: { cookie: adminCookie },
      payload: { referenceType: 'ROLE', name: 'Engineer' },
    });
    const roleId = role.json().id;

    const mkMember = async (fullName: string, email: string) => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/members',
        headers: { cookie: adminCookie },
        payload: {
          fullName,
          email,
          orgUnitId: orgId,
          employmentType: 'ON_ROLL',
          roleId,
          skillIds: [],
        },
      });
      if (response.statusCode !== 201) throw new Error(`member: ${response.body}`);
      return response.json().id as string;
    };
    adaId = await mkMember('Ada Lovelace', 'ada@example.com');
    graceId = await mkMember('Grace Hopper', 'grace@example.com');

    const ada = await services.identity.createAccount(
      { username: 'ada', role: 'TEAM_MEMBER', homeOrgUnitId: orgId },
      PASSWORD,
    );
    adaAccountId = ada.id;
    const second = await services.identity.createAccount(
      { username: 'second', role: 'TEAM_MEMBER', homeOrgUnitId: orgId },
      PASSWORD,
    );
    secondAccountId = second.id;
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await db?.destroy();
  });

  async function link(accountId: string, memberId: string, cookie = adminCookie) {
    return app.inject({
      method: 'POST',
      url: `/api/accounts/${accountId}/link`,
      headers: { cookie },
      payload: { memberId },
    });
  }

  async function unlink(accountId: string, cookie = adminCookie) {
    return app.inject({
      method: 'DELETE',
      url: `/api/accounts/${accountId}/link`,
      headers: { cookie },
    });
  }

  it('links an account to a member (BR-L-01)', async () => {
    const response = await link(adaAccountId, adaId);
    expect(response.statusCode).toBe(200);
    expect(response.json().linkedMemberId).toBe(adaId);
  });

  it('the link makes the account own-scope resolve to that member', async () => {
    const cookie = await signIn('ada');
    const response = await app.inject({
      method: 'GET',
      url: '/api/members/me',
      headers: { cookie },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().id).toBe(adaId);
  });

  it('relinking the SAME member is idempotent, not an error', async () => {
    const response = await link(adaAccountId, adaId);
    expect(response.statusCode).toBe(200);
    expect(response.json().linkedMemberId).toBe(adaId);
  });

  /** BR-L-02 — and the refusal must NAME the existing member, not just say "conflict". */
  it('refuses relinking to a DIFFERENT member and names the current one', async () => {
    const response = await link(adaAccountId, graceId);
    expect(response.statusCode).toBe(409);
    const error = response.json().error;
    expect(error.message).toContain('Ada Lovelace');
    expect(error.detail.reason).toBe('ACCOUNT_ALREADY_LINKED');
  });

  /** BR-L-03 — the mirror refusal, naming the account that holds the link. */
  it('refuses linking a member who is already linked, and names that account', async () => {
    const response = await link(secondAccountId, adaId);
    expect(response.statusCode).toBe(409);
    const error = response.json().error;
    expect(error.message).toContain('ada');
    expect(error.detail.reason).toBe('MEMBER_ALREADY_LINKED');
  });

  /**
   * R2 obligation 5 / US-ENB-04: the two refusals must be distinguishable by CODE, not by
   * matching prose — an admin client needs to know whether to unlink this account or the other.
   */
  it('the two refusals carry DIFFERENT machine-readable reasons', async () => {
    const a = await link(adaAccountId, graceId);
    const b = await link(secondAccountId, adaId);
    expect(a.json().error.detail.reason).not.toBe(b.json().error.detail.reason);
  });

  it('BR-L-05: linking does not alter home_org_unit_id', async () => {
    const row = await db
      .selectFrom('user_account')
      .select(['home_org_unit_id', 'linked_member_id'])
      .where('id', '=', adaAccountId)
      .executeTakeFirstOrThrow();
    expect(row.home_org_unit_id).toBe(orgId);
    expect(row.linked_member_id).toBe(adaId);
  });

  it('404s for an unknown account or member', async () => {
    const badAccount = await link('11111111-1111-1111-1111-111111111111', graceId);
    expect(badAccount.statusCode).toBe(404);
    const badMember = await link(secondAccountId, '11111111-1111-1111-1111-111111111111');
    expect(badMember.statusCode).toBe(404);
  });

  it('BR-L-07: a member with no linked account is complete and usable', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/members/${graceId}`,
      headers: { cookie: adminCookie },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().fullName).toBe('Grace Hopper');
  });

  describe('the account list (BR-L-06)', () => {
    it('resolves linked member names', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/accounts',
        headers: { cookie: adminCookie },
      });
      expect(response.statusCode).toBe(200);
      const items = response.json().items as Array<{
        username: string;
        linkedMember: { fullName: string } | null;
      }>;
      expect(items.find((a) => a.username === 'ada')?.linkedMember?.fullName).toBe('Ada Lovelace');
      expect(items.find((a) => a.username === 'second')?.linkedMember).toBeNull();
    });

    it('is refused for a non-admin', async () => {
      await services.identity.createAccount(
        { username: 'lead', role: 'TEAM_LEAD', homeOrgUnitId: orgId },
        PASSWORD,
      );
      const cookie = await signIn('lead');
      const list = await app.inject({
        method: 'GET',
        url: '/api/accounts',
        headers: { cookie },
      });
      expect(list.statusCode).toBe(403);

      const attempt = await link(secondAccountId, graceId, cookie);
      expect(attempt.statusCode).toBe(403);
    });
  });

  /**
   * ⚠️ THE TEST THAT MATTERS MOST IN THIS FILE.
   *
   * BR-L-04 + BR-R-18: unlinking a TEAM_MEMBER account leaves it with no own-data to be scoped
   * to, so `canRead` refuses it entirely. This is a real access revocation dressed as a small
   * administrative edit, which is exactly why the UI confirmation has to say so — and why it is
   * asserted here rather than assumed.
   */
  describe('unlink revokes a TEAM_MEMBER access (BR-L-04 + BR-R-18)', () => {
    it('the account works while linked', async () => {
      const cookie = await signIn('ada');
      const response = await app.inject({
        method: 'GET',
        url: '/api/members/me',
        headers: { cookie },
      });
      expect(response.statusCode).toBe(200);
    });

    it('unlink reports that access was revoked', async () => {
      const response = await unlink(adaAccountId);
      expect(response.statusCode).toBe(200);
      expect(response.json().linkedMemberId).toBeNull();
      // Explicit in the payload so a client can warn without a second lookup.
      expect(response.json().accessRevoked).toBe(true);
    });

    it('and the account can now see NOTHING (BR-R-18)', async () => {
      const cookie = await signIn('ada');
      const me = await app.inject({
        method: 'GET',
        url: '/api/members/me',
        headers: { cookie },
      });
      /**
       * 404 here, 403 on the collection below — an asymmetry worth documenting rather than
       * flattening. `/members/me` asks "find MY record", and for an unlinked account the honest
       * answer is that there isn't one ("A linked member record for this account was not
       * found."). The collection asks "show me members", and the honest answer is a refusal with
       * the actionable message. Neither leaks anything, and making them uniform would mean
       * modifying Unit 1 route code for no gain.
       */
      expect(me.statusCode).toBe(404);
      expect(me.json().error.code).toBe('NOT_FOUND');
      expect(me.json().error.message).toMatch(/linked member record/i);

      const members = await app.inject({
        method: 'GET',
        url: '/api/members',
        headers: { cookie },
      });
      expect(members.statusCode).toBe(403);
      // The actionable message from BR-R-18's refusal path.
      expect(members.json().error.message).toMatch(/not linked/i);
      expect(members.json().error.message).toMatch(/administrator/i);
    });

    it('unlinking a NON-team-member does not report revocation', async () => {
      await services.identity.createAccount(
        { username: 'rm', role: 'RESOURCE_MANAGER', homeOrgUnitId: orgId },
        PASSWORD,
      );
      const accounts = await app.inject({
        method: 'GET',
        url: '/api/accounts',
        headers: { cookie: adminCookie },
      });
      const rm = (accounts.json().items as Array<{ id: string; username: string }>).find(
        (a) => a.username === 'rm',
      );
      const response = await unlink(rm?.id as string);
      expect(response.statusCode).toBe(200);
      // A Resource Manager's access comes from their org unit, not from a member link.
      expect(response.json().accessRevoked).toBe(false);
    });

    it('relinking restores access', async () => {
      const relink = await link(adaAccountId, adaId);
      expect(relink.statusCode).toBe(200);
      const cookie = await signIn('ada');
      const me = await app.inject({
        method: 'GET',
        url: '/api/members/me',
        headers: { cookie },
      });
      expect(me.statusCode).toBe(200);
      expect(me.json().id).toBe(adaId);
    });
  });
});
