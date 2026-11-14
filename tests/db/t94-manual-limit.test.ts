import { randomUUID } from 'node:crypto'

import type { Client } from 'pg'
import { afterAll, beforeAll, expect, it } from 'vitest'

import { benefits, invite } from '../t94-config'

import { anonClient, connectAdmin, createUser, profileOf, serviceClient } from './helpers'

let db: Client
beforeAll(async () => { db = await connectAdmin() })
afterAll(async () => { await db.end() })

const args = (user: string, code: string | null, context = 'account') => ({
  p_user: user, p_code: code, p_context: context, p_invitee_credits: null, p_invite_window_days: invite.windowDays,
})
async function attempt(user: string, code: string | null, context = 'account') {
  const response = await serviceClient().rpc('redeem_limited_code', args(user, code, context))
  if (response.error) throw Error(response.error.message)
  return response.data
}

it('serializes failed and malformed claims across clients: exactly ten requests per rolling hour', async () => {
  const user = await createUser(db)
  const unknown = randomUUID().replaceAll('-', '').slice(0, 12)
  const attempts = await Promise.all(Array.from({ length: 15 }, (_, i) => attempt(user, i % 2 ? unknown : null)))
  expect(attempts.filter((row) => (row as { status: string }).status === 'rate_limited')).toHaveLength(5)
  const { rows: [usage] } = await db.query('select cardinality(code_redeem_attempts) as n from public.profiles where id=$1', [user])
  expect(usage.n).toEqual(10)
  await db.query("update public.profiles set code_redeem_attempts[1] = now() - interval '61 minutes' where id=$1", [user])
  expect(await attempt(user, unknown, 'paywall')).toEqual({ status: 'not_found' })
  expect(await attempt(user, null)).toEqual({ status: 'rate_limited' })
  expect(await attempt(await createUser(db), null)).toEqual({ status: 'invalid_input' })
})

it('the eleventh request cannot grant a valid gift, while signup remains independent of the manual quota', async () => {
  const user = await createUser(db)
  const gift = randomUUID().replaceAll('-', '').slice(0, 20).toUpperCase()
  await db.query("insert into public.codes(code,kind,invitee_pool,invitee_credits) values($1,'campaign','free',50)", [gift])
  await db.query("update public.profiles set code_redeem_attempts = array_fill(now(), array[10]) where id=$1", [user])
  expect(await attempt(user, gift)).toEqual({ status: 'rate_limited' })
  expect((await profileOf(db, user)).free_credits).toBe(0)
  const granted = await serviceClient().rpc('redeem_code', args(user, gift, 'signup'))
  expect(granted.error).toBeNull()
  expect(granted.data).toMatchObject({ status: 'ok', credits_granted: 50 })
})

it('handles simultaneous reciprocal invites without taking the quota profile locks in the wrong order', async () => {
  const users = [await createUser(db), await createUser(db)]
  for (const user of users) await db.query("select public.grant_credits($1,$3,'signup',$2,'free')", [user, 'signup:' + user, benefits.freeCredits])
  const codes = await Promise.all(users.map((user) => serviceClient().rpc('get_or_create_invite_code', { p_user: user })))
  const results = await Promise.all(users.map((user, i) => attempt(user, String(codes[1 - i].data))))
  expect(results).toEqual([expect.objectContaining({ status: 'ok' }), expect.objectContaining({ status: 'ok' })])
})

it('exposes the budget to the service role alone and excludes the signup context', async () => {
  const user = await createUser(db)
  expect((await anonClient().rpc('redeem_limited_code', args(user, null))).error).toBeTruthy()
  await expect(attempt(user, 'TEST', 'signup')).rejects.toThrow('INVALID_INPUT')
})
