import { randomUUID } from 'node:crypto'

import type { Client } from 'pg'
import { afterAll, beforeAll, expect, it } from 'vitest'

import { invite } from '../t94-config'

import { row } from './affiliate-fixtures'
import { connectAdmin, createUser, serviceClient } from './helpers'

// Migration 2030 (ARCHITECTURE §6.4, Owner 2026-11-27): an invite code is redeemable only at
// sign-up. From the account page or the paywall it is refused (status new_users_only, reason
// signup_only, so older app code shows its usual refusal) and nothing is written. Campaign codes
// work from every context as before. Fake data only.

let db: Client
beforeAll(async () => { db = await connectAdmin() })
afterAll(async () => { await db.end() })

const codeOf = async (user: string) => (await row(db, 'select get_or_create_invite_code($1) as code', [user])).code as string
async function newcomer() {
  const user = await createUser(db)
  await db.query("select grant_credits($1::uuid,6,'signup',$2,'free')", [user, 'signup:' + user])
  return user
}
const redeem = async (user: string, code: string, context: string) =>
  (await row(db, 'select redeem_code($1,$2,$3,null,$4) as r', [user, code, context, invite.windowDays])).r
const limited = async (user: string, code: string, context: string) => {
  const { data, error } = await serviceClient().rpc('redeem_limited_code', {
    p_user: user, p_code: code, p_context: context, p_invitee_credits: null, p_invite_window_days: invite.windowDays,
  })
  if (error) throw new Error(error.message)
  return data
}
const written = async (user: string) => ({
  rows: (await row(db, 'select count(*)::int n from code_redemptions where user_id=$1', [user])).n,
  grants: (await row(db, "select count(*)::int n from credit_ledger where user_id=$1 and kind='code_grant'", [user])).n,
  bound: (await row(db, 'select referred_by from profiles where id=$1', [user])).referred_by,
})

it('refuses an invite code from the account page and the paywall a minute after sign-up, writing nothing', async () => {
  const inviter = await createUser(db)
  const code = await codeOf(inviter)
  const user = await newcomer()
  for (const context of ['account', 'paywall']) {
    expect(await redeem(user, code, context)).toEqual({ kind: 'invite', status: 'new_users_only', reason: 'signup_only' })
    expect(await limited(user, code, context)).toEqual({ kind: 'invite', status: 'new_users_only', reason: 'signup_only' })
  }
  expect(await written(user)).toEqual({ rows: 0, grants: 0, bound: null })
  // The same code still works at sign-up.
  expect(await redeem(user, code, 'signup')).toMatchObject({ status: 'ok', kind: 'invite' })
  expect((await written(user)).rows).toBe(1)
})

it('keeps the earlier answers where they apply: own code, already used, banned', async () => {
  const user = await newcomer()
  expect((await redeem(user, await codeOf(user), 'account')).status).toBe('own')
  const code = await codeOf(await createUser(db))
  expect((await redeem(user, code, 'signup')).status).toBe('ok')
  expect((await redeem(user, code, 'account')).status).toBe('used')
  const banned = await newcomer()
  await db.query('update profiles set banned_at=now() where id=$1', [banned])
  expect((await redeem(banned, code, 'account')).status).toBe('banned')
})

it('leaves campaign codes redeemable from the account page and the paywall', async () => {
  const user = await newcomer()
  for (const context of ['account', 'paywall']) {
    const gift = randomUUID().replaceAll('-', '').slice(0, 16).toUpperCase()
    await db.query("insert into codes(code,kind,invitee_credits,invitee_pool,new_users_only) values($1,'campaign',30,'free',true)", [gift])
    expect(await limited(user, gift, context)).toMatchObject({ status: 'ok', kind: 'campaign', credits_granted: 30 })
  }
})
