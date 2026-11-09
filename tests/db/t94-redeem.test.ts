import { randomUUID } from 'node:crypto'

import type { Client } from 'pg'
import { afterAll, beforeAll, expect, it } from 'vitest'

import { connectAdmin, createUser, ledgerOf, profileOf, serviceClient } from './helpers'

let db: Client
const uniqueCode = () => randomUUID().replaceAll('-', '').slice(0, 16).toUpperCase()
beforeAll(async () => { db = await connectAdmin() })
afterAll(async () => { await db.end() })

async function invite(user: string): Promise<string> {
  const result = await serviceClient().rpc('get_or_create_invite_code', { p_user: user })
  if (typeof result.data !== 'string') throw new Error(result.error?.message ?? 'Missing invite code')
  return result.data
}

async function redeem(user: string, code: string, replace = false, context = 'account') {
  const { data, error } = await serviceClient().rpc('redeem_code', {
    p_user: user, p_code: code, p_context: context, p_invitee_credits: 6, p_invite_window_days: 7, p_replace: replace,
  })
  if (error) throw new Error(error.message)
  return data as { status: string; discount_expires_at?: string; current_code?: string }
}

async function gift(pool = 'free', limit: number | null = null) {
  const code = uniqueCode()
  await db.query(`insert into codes (code,kind,invitee_credits,invitee_pool,max_redemptions)
    values ($1,'campaign',50,$2,$3)`, [code, pool, limit])
  return code
}

async function discount() {
  const code = uniqueCode()
  await db.query(`insert into codes
    (code,kind,invitee_credits,invitee_pool,discount_percent,discount_products,discount_duration,
     discount_valid_days,stripe_coupon_id,expires_at)
    values ($1,'campaign',2,'free',20,array['starter_monthly'],'once',14,$2,now()+interval '2 days')`,
  [code, `coupon_${code}`])
  return code
}

async function grant(user: string) {
  const { rows } = await db.query<{ applied: boolean }>(
    "select applied from public.grant_credits($1,6,'signup',$2,'free')", [user, `signup:${user}`],
  )
  return rows[0].applied
}

async function countClaims(code: string) {
  const { rows } = await db.query<{ redemption_count: number }>('select redemption_count from codes where code = $1', [code])
  return rows[0].redemption_count
}

it('returns one canonical invite on concurrent first opens; clients cannot execute either RPC', async () => {
  const owner = await createUser(db)
  const invites = await Promise.all([invite(owner), invite(owner)])
  expect(invites[0]).toMatch(/^[2-9A-HJKMNP-Z]{8}$/)
  expect(invites[1]).toBe(invites[0])
  const { rows } = await db.query<{ allowed: boolean }>(
    `select has_function_privilege(r, f, 'EXECUTE') allowed from
      unnest(array['anon','authenticated']) r cross join unnest(array[
        'public.get_or_create_invite_code(uuid)','public.redeem_code(uuid,text,text,int,int,boolean)'
      ]) f`,
  )
  expect(rows).toEqual(Array(4).fill({ allowed: false }))
})

it('accepts an invite in lowercase once and grants the configured extra free credits', async () => {
  const owner = await createUser(db)
  const guest = await createUser(db)
  const code = await invite(owner)
  expect(await grant(guest)).toBe(true)
  expect(await redeem(guest, code.toLowerCase(), false, 'signup')).toMatchObject({ status: 'ok', pool: 'free', credits_granted: 6 })
  expect((await redeem(guest, code)).status).toBe('used')
  expect((await redeem(guest, await invite(await createUser(db)))).status).toBe('already_invited')
  expect((await profileOf(db, guest)).free_credits).toBe(12)
  expect((await profileOf(db, owner)).credits).toBe(0)
  const { rows } = await db.query<{ id: string }>('select id from code_redemptions where user_id = $1', [guest])
  expect(await ledgerOf(db, guest)).toContainEqual({
    kind: 'code_grant', pool: 'free', delta: 6, idempotency_key: `code:${rows[0].id}`,
  })
  expect(await countClaims(code)).toBe(1)
})

it('rejects unavailable offers, banned accounts, and self invites', async () => {
  const user = await createUser(db)
  expect((await redeem(user, uniqueCode())).status).toBe('not_found')
  expect((await redeem(user, await invite(user))).status).toBe('own')
  const code = await gift()
  for (const change of ["active=false", "active=true,starts_at=now()+interval '1 day'", "starts_at=null,expires_at=now()"]) {
    await db.query(`update codes set ${change} where code=$1`, [code])
    expect((await redeem(user, code)).status).toBe('expired')
  }
  await db.query('update profiles set banned_at=now() where id=$1', [user])
  expect((await redeem(user, await gift())).status).toBe('banned')
  expect((await redeem(await createUser(db), await invite(user))).status).toBe('expired')
})

it('enforces both the age limit and the first-payment cutoff on all invite entry points', async () => {
  const owner = await createUser(db)
  const code = await invite(owner)
  const old = await createUser(db)
  await db.query("update profiles set created_at=now()-interval '8 days' where id=$1", [old])
  const campaign = await gift()
  await db.query('update codes set new_users_only=true where code=$1', [campaign])
  expect((await redeem(old, campaign)).status).toBe('new_users_only')
  expect((await redeem(old, code, false, 'signup')).status).toBe('new_users_only')
  const paid = await createUser(db)
  await db.query(`insert into payments(user_id,product_id,channel,stripe_session_id,amount_total,currency,method)
    values ($1,'pack_s','stripe',$2,990,'usd','card')`, [paid, `cs_${randomUUID()}`])
  expect((await redeem(paid, code)).status).toBe('new_users_only')
  expect((await redeem(paid, campaign)).status).toBe('ok')
})

it('persists blocked same-IP and refused-signup-grant attempts without recording a success', async () => {
  const user = await createUser(db)
  const peer = await createUser(db)
  const outsider = await createUser(db)
  const cohortIp = '2001:db8:' + randomUUID().slice(0, 4) + ':' + randomUUID().slice(0, 4) + '::1'
  await db.query('update profiles set signup_ip=$1 where id=any($2::uuid[])', [cohortIp, [user, peer]])
  expect(await grant(user)).toBe(true)
  expect(await grant(peer)).toBe(false)
  const peerInvite = await invite(user)
  const outsiderInvite = await invite(outsider)
  expect((await redeem(peer, peerInvite)).status).toBe('blocked_same_ip')
  const otherRefused = await createUser(db)
  await db.query('update profiles set signup_ip=$1 where id=$2', [cohortIp, otherRefused])
  expect(await grant(otherRefused)).toBe(false)
  expect((await redeem(otherRefused, outsiderInvite)).status).toBe('blocked_no_signup_grant')
  const { rows } = await db.query(`select status,credits_granted from code_redemptions
    where user_id=any($1::uuid[]) order by status`, [[peer, otherRefused]])
  expect(rows).toEqual([
    { status: 'blocked_no_signup_grant', credits_granted: 0 }, { status: 'blocked_same_ip', credits_granted: 0 },
  ])
  expect(await countClaims(peerInvite)).toBe(0)
  expect(await countClaims(outsiderInvite)).toBe(0)
  expect(await ledgerOf(db, otherRefused)).toHaveLength(0)
  expect(await ledgerOf(db, peer)).toHaveLength(0)
})

it('serializes two claims against the last paid-pool gift; the winner can safely retry', async () => {
  const code = await gift('paid', 1)
  const users = [await createUser(db), await createUser(db)]
  const claims = await Promise.all(users.map(user => redeem(user, code)))
  expect(claims.map(row => row.status).sort()).toEqual(['full', 'ok'])
  const winner = users[claims.findIndex(row => row.status === 'ok')]
  expect((await redeem(winner, code)).status).toBe('used')
  expect((await profileOf(db, winner)).credits).toBe(50)
  expect(await ledgerOf(db, winner)).toEqual([expect.objectContaining({ kind: 'code_grant', pool: 'paid', delta: 50 })])
  expect((await redeem(winner, await gift())).status).toBe('ok')
  expect(await countClaims(code)).toBe(1)
})

it('serializes different discount claims and leaves confirmation side-effect free', async () => {
  const user = await createUser(db)
  const codes = [await discount(), await discount()]
  const claims = await Promise.all(codes.map(code => redeem(user, code)))
  expect(claims.map(row => row.status).sort()).toEqual(['needs_confirm', 'ok'])
  const winner = codes[claims.findIndex(row => row.status === 'ok')]
  const loser = codes[claims.findIndex(row => row.status === 'needs_confirm')]
  expect(claims.find(row => row.status === 'needs_confirm')?.current_code).toBe(winner)
  expect(await countClaims(loser)).toBe(0)
  expect((await profileOf(db, user)).free_credits).toBe(2)
  const { rows: before } = await db.query(`select r.discount_void_at, r.discount_expires_at=c.expires_at as bounded
    from code_redemptions r join codes c on c.id=r.code_id where r.user_id=$1`, [user])
  expect(before).toEqual([{ discount_void_at: null, bounded: true }])
  await db.query("update code_redemptions set checkout_token=gen_random_uuid(),checkout_expires_at=now()+interval '30 min' where user_id=$1", [user])
  expect((await redeem(user, loser, true)).status).toBe('checkout_in_progress')
  await db.query("update code_redemptions set checkout_expires_at=now()-interval '1 second' where user_id=$1", [user])
  expect(await redeem(user, loser, true)).toMatchObject({ status: 'ok', replaced: true })
  const { rows: after } = await db.query(`select c.code from code_redemptions r join codes c on c.id=r.code_id
    where r.user_id=$1 and r.discount_void_at is not null`, [user])
  expect(after).toEqual([{ code: winner }])
})
