import { randomUUID } from 'node:crypto'
import type { Client } from 'pg'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { dossier, dossierAudit, dossierChanges, dossierCommissions, dossiers } from '@/core/affiliate/admin/dossier-read'
import { connectAdmin, createUser } from './helpers'
import { anonSupabase, serviceSupabase } from './supabase-env'

const token = randomUUID().slice(0, 8)
const ownerSlug = 'dossier-' + token
const teamSlug = 'team-' + token
const name = '档案_' + token
const email = ownerSlug + '@example.test'
const phone = '1415' + String(parseInt(token, 16) % 10000000).padStart(7, '0')
const api = serviceSupabase()
const users: string[] = []
let db: Client, actor: string, buyer: string, owner: string, member: string, banned: string, reward: string

async function account() {
  const user = await createUser(db)
  users.push(user)
  return user
}

async function setupAccounts() {
  actor = await account()
  banned = await account()
  buyer = await account()
  owner = await account()
  member = await account()
  await db.query("update profiles set role='admin' where id=any($1::uuid[])", [[actor, banned]])
  await db.query('update profiles set banned_at=now() where id=$1', [banned])
  await db.query("update auth.users set email=$2,phone=$3,created_at='2020-05-04T00:00Z' where id=$1", [owner, email, phone])
  await db.query(`insert into affiliates(user_id,slug,status,team_enabled,application,payout_method,payout_details,terms_version,terms_accepted_at)
    values ($1,$2,'active',true,$3,'wise','payout instructions','v-qa',now())`,
    [owner, ownerSlug, { name, channel_type: 'youtube', audience: '1k_10k' }])
  await db.query("insert into affiliates(user_id,slug,status,parent_user_id) values ($1,$2,'active',$3)", [member, teamSlug, owner])
  for (const status of ['pending', 'rejected', 'suspended', 'banned']) {
    await db.query('insert into affiliates(user_id,slug,status,parent_user_id) values ($1,$2,$3,$4)',
      [await account(), status + '-' + token, status, owner])
  }
  await db.query("insert into affiliate_rate_overrides(user_id,product_kind,l1_bp) values ($1,'pack',1800)", [owner])
}

async function payment() {
  const { rows } = await db.query(`insert into payments(user_id,product_id,channel,amount_total,currency,method,stripe_session_id)
    values ($1,'pack_m','stripe',5000,'usd','card',$2) returning id`, [buyer, 'cs_' + randomUUID()])
  return rows[0].id
}

async function commission(user: string, level: number, status: string, amount: number, saleId?: string) {
  const { rows } = await db.query(`insert into affiliate_commissions
    (affiliate_user_id,payment_id,level,product_id,rate_bp,base_usd,amount,status,confirm_after)
    values ($1,$2,$3,'pack_m',1500,5000,$4,$5,now()) returning id`, [user, saleId ?? await payment(), level, amount, status])
  return String(rows[0].id)
}

async function setupMoney() {
  const fromTeam = await payment()
  await commission(member, 1, 'confirmed', 120, fromTeam)
  reward = await commission(owner, 2, 'confirmed', 200, fromTeam)
  await commission(owner, 1, 'confirmed', 650)
  await commission(owner, 1, 'pending', 100)
  await commission(owner, 1, 'on_hold', 60)
  await commission(owner, 1, 'void', 0)
  await db.query(`insert into affiliate_payouts(affiliate_user_id,period,amount,paid_amount,status,payout_snapshot) values
    ($1,'2018-01-01',400,325,'paid','{}'),($1,'2018-02-01',70,null,'paid','{}'),
    ($1,'2018-03-01',200,null,'due','{}'),($1,'2018-04-01',120,null,'held','{}'),
    ($2,'2018-01-01',50,30,'paid','{}')`, [owner, member])
  await db.query('select admin_affiliate_adjust($1,$2)', [actor, { user_id: owner, amount: -50, request_id: randomUUID(), reason: 'dossier adjustment' }])
  await db.query(`insert into affiliate_commission_changes(commission_id,at,new_status,new_amount,reason)
    select $1,'2018-01-01','confirmed',200,'history '||n from generate_series(1,31) n`, [reward])
}

beforeAll(async () => {
  db = await connectAdmin()
  await db.query('begin')
  await setupAccounts()
  await setupMoney()
  await db.query('commit')
})

afterAll(async () => {
  if (db) {
    await db.query('rollback')
    await db.query('delete from auth.users where id=any($1::uuid[])', [users])
    await db.end()
  }
})

it('returns the same four amounts in the directory and profile, based on actual payouts and reservations', async () => {
  const summary = { user_id: owner, name, email, phone, slug: ownerSlug, earned: 1010, confirmed: 850, unwithdrawn: 185, paid: 395, team_count: 1 }
  for (const query of [email.toUpperCase(), '+' + phone, name, ownerSlug, owner]) {
    const page = await dossiers(api, actor, { query })
    expect(page.items).toHaveLength(1)
    expect(page.items[0]).toMatchObject(summary)
  }
  const detail = await dossier(api, actor, owner)
  expect(detail).toMatchObject({ ...summary,
    registered_at: expect.stringContaining('2020-05-04'), application: { channel_type: 'youtube' },
    rates: [{ product_kind: 'pack', l1_bp: 1800 }], payout_details: 'payout instructions', terms_version: 'v-qa',
  })
  expect(await dossier(api, actor, buyer)).toBeNull()
  const team = await dossiers(api, actor, { parent: owner })
  expect(team.items.find((r) => r.user_id === member)).toMatchObject({ earned: 120, confirmed: 120, unwithdrawn: 90, paid: 30, team_count: null })
})

it('counts only active team members in the directory and dossier while the team tab retains every status', async () => {
  const [directory, profile, team] = await Promise.all([
    dossiers(api, actor, { query: owner }), dossier(api, actor, owner), dossiers(api, actor, { parent: owner }),
  ])
  expect(directory.items.map((r) => [r.user_id, r.team_count])).toEqual([[owner, 1]])
  expect(profile?.team_count).toBe(1)
  expect(team.items.map((r) => r.status).sort()).toEqual(['active', 'banned', 'pending', 'rejected', 'suspended'])
})

it('paginates identities sharing a timestamp and excludes reserved invitations from the application queue', async () => {
  const ids = Array.from({ length: 33 }, () => randomUUID())
  users.push(...ids)
  const prefix = 'dir-' + token
  await db.query('begin')
  try {
    await db.query(`insert into auth.users(id,email,aud,role)
      select id,id::text||'@example.test','authenticated','authenticated' from unnest($1::uuid[]) id`, [ids])
    await db.query(`insert into affiliates(user_id,slug,status,application,created_at)
      select id,$2||'-'||n,case when n=33 then 'rejected' else 'pending' end,
        case when n=32 then '{"source":"admin_invite"}'::jsonb else '{}'::jsonb end,'2023-01-01'
      from unnest($1::uuid[]) with ordinality u(id,n)`, [ids, prefix])
    await db.query('commit')
  } catch (error) {
    await db.query('rollback')
    throw error
  }
  const search = { query: prefix, review: 'pending' as const }
  const first = await dossiers(api, actor, search)
  expect(first.items).toHaveLength(30)
  expect(first.nextCursor).toBeTruthy()
  const last = await dossiers(api, actor, { ...search, cursor: first.nextCursor! })
  expect(last.nextCursor).toBeNull()
  expect([...first.items, ...last.items].map((item) => item.user_id)).toEqual(ids.slice(0, 31).sort().reverse())
  expect((await dossiers(api, actor, { query: prefix, review: 'rejected' })).items.map((r) => r.id)).toEqual([ids[32]])
})

it('isolates each level of commission and its history, and resolves the member behind a team reward', async () => {
  const direct = await dossierCommissions(api, owner, 1)
  expect(direct.items).toHaveLength(4)
  expect(direct.items.every((r) => r.level === 1 && r.affiliate_user_id === owner)).toBe(true)
  const bonus = await dossierCommissions(api, owner, 2)
  expect(bonus.items).toHaveLength(1)
  expect(bonus.items[0]).toMatchObject({ id: reward, amount: 200, direct: { user_id: member, slug: teamSlug } })
  const changes = (aff: string, level: 1 | 2, cursor?: string) => dossierChanges(api, actor, aff, level, reward, cursor)
  expect((await changes(member, 2)).items).toEqual([])
  expect((await changes(owner, 1)).items).toEqual([])
  const first = await changes(owner, 2)
  expect(first.items).toHaveLength(30)
  const last = await changes(owner, 2, first.nextCursor!)
  expect(last.items).toHaveLength(1)
  expect(last.nextCursor).toBeNull()
  expect(new Set([...first.items, ...last.items].map((r) => r.id)).size).toBe(31)
})

it('scopes the audit trail to actions affecting this affiliate, including transactions keyed by adjustment ID', async () => {
  const events = await dossierAudit(api, actor, owner)
  expect(events.items).toEqual(expect.arrayContaining([expect.objectContaining({ action: 'affiliate_adjust', reason: 'dossier adjustment', user_id: actor })]))
  expect((await dossierAudit(api, actor, member)).items).toEqual([])
})

it('shows both sides of reassignment and ignores affiliate IDs mentioned inside a free-text note', async () => {
  const unrelated = await account()
  await db.query("insert into affiliates(user_id,slug,status) values ($1,$2,'active')", [unrelated, 'extra-' + token])
  const rebind = (id: string, reason: string) => db.query('select admin_affiliate_rebind($1,$2)', [actor, {
    user_id: buyer, affiliate_user_id: id, reason,
  }])
  await rebind(owner, 'first')
  const note = 'second, see ' + unrelated + ' → ' + unrelated
  await rebind(member, note)
  for (const participant of [owner, member]) {
    const log = await dossierAudit(api, actor, participant)
    expect(log.items).toEqual(expect.arrayContaining([expect.objectContaining({ action: 'affiliate_rebind', target_id: buyer, reason: expect.stringContaining(note) })]))
  }
  expect((await dossierAudit(api, actor, unrelated)).items).toEqual([])
})

it('allows only service-role calls with a current unbanned admin as actor to read private dossier RPCs', async () => {
  const functions = [
    ['admin_affiliate_directory', { p_query: email }], ['admin_affiliate_dossier', { p_user: owner }],
    ['admin_affiliate_dossier_log', { p_user: owner }],
    ['admin_affiliate_commission_history', { p_user: owner, p_commission: reward, p_level: 2 }],
  ] as const
  const privileges = await db.query(`select proname, has_function_privilege('anon',oid,'execute') anon,
    has_function_privilege('authenticated',oid,'execute') authenticated, has_function_privilege('service_role',oid,'execute') service
    from pg_proc where pronamespace='public'::regnamespace and proname=any($1)`, [functions.map(([fn]) => fn)])
  expect(privileges.rows).toHaveLength(4)
  for (const privilegesOf of privileges.rows) expect(privilegesOf).toMatchObject({ anon: false, authenticated: false, service: true })
  const privateView = await db.query(`select has_table_privilege(role_name::name,'admin.affiliate_directory_rows','select') as readable
    from unnest(array['anon','authenticated','service_role']) role_name`)
  expect(privateView.rows.map((r) => r.readable)).toEqual([false, false, false])
  for (const [fn, args] of functions) {
    expect((await anonSupabase().rpc(fn, { ...args, p_actor: actor })).error).not.toBeNull()
    for (const unprivileged of [buyer, banned]) {
      expect((await api.rpc(fn, { ...args, p_actor: unprivileged })).error?.message).toBe('NOT_ADMIN')
    }
  }
})
