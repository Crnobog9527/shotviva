import type { Client } from 'pg'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest'

import { invite } from '../t94-config'

import { row } from './affiliate-fixtures'
import { connectAdmin, createUser } from './helpers'

// The sign-up code stored at email sign-up (2030, review on #977): an invite code is for sign-up
// only, so a confirmation opened on another device must still apply it. Same rules as the partner
// link of 2021 (affiliate-signup-refs.test.ts). Each test runs in a transaction that is rolled
// back. Fake data only.

let db: Client
beforeAll(async () => { db = await connectAdmin() })
beforeEach(async () => { await db.query('begin') })
afterEach(async () => { await db.query('rollback') })
afterAll(async () => { await db.end() })

const store = async (user: string, code: string | null) =>
  (await row(db, 'select signup_code_store($1,$2) as stored', [user, code])).stored as boolean
const take = async (user: string) => (await row(db, 'select signup_code_take($1) as code', [user])).code as string | null
const rows = async () => (await row(db, 'select count(*)::int n from signup_code_refs')).n as number

async function justCreated() {
  const id = await createUser(db)
  await db.query(`update auth.users set created_at=now(),email_confirmed_at=null,phone_confirmed_at=null,last_sign_in_at=null,
    confirmation_sent_at=now()-interval '1 second' where id=$1`, [id])
  return id
}

it('the latest sign-up form wins, the code is handed out once, and an empty form clears it', async () => {
  const user = await justCreated()
  expect(await store(user, 'FRIEND01')).toBe(true)
  expect(await store(user, 'FRIEND02')).toBe(true)
  expect(await take(user)).toBe('FRIEND02')
  expect(await take(user)).toBeNull()
  await store(user, 'FRIEND01')
  expect(await store(user, null)).toBe(false)
  expect(await take(user)).toBeNull()
})

it('stores nothing for a malformed code, an unknown account, or one that is not just created', async () => {
  const user = await justCreated()
  for (const value of ['abc', 'AB', 'FRIEND-1', "AB'--", 'friend01']) expect(await store(user, value)).toBe(false)
  expect(await store('00000000-0000-4000-8000-000000000000', 'FRIEND01')).toBe(false)
  for (const change of ['email_confirmed_at=now()', 'phone_confirmed_at=now()', 'last_sign_in_at=now()', "created_at=now()-interval '11 minutes'"]) {
    const other = await justCreated()
    await db.query(`update auth.users set ${change} where id=$1`, [other])
    expect(await store(other, 'FRIEND01')).toBe(false)
  }
  expect(await rows()).toBe(0)
})

it('drops the row unused after a resend, a reset or email change sent after it, a Google identity, or a day', async () => {
  const cases = [
    "update auth.users set confirmation_sent_at=now()+interval '1 second' where id=$1",
    "update auth.users set recovery_sent_at=now()+interval '1 second' where id=$1",
    "update auth.users set email_change_sent_at=now()+interval '1 second' where id=$1",
    `insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
     values ($1::text, $1::uuid, jsonb_build_object('sub', $1::text), 'google', now(), now(), now())`,
    `update signup_code_refs set created_at=now()-interval '25 hours' where user_id=$1;`,
  ]
  for (const change of cases) {
    const user = await justCreated()
    expect(await store(user, 'FRIEND01')).toBe(true)
    if (change.startsWith('update signup_code_refs')) {
      await db.query(change.replace(';', ''), [user])
      await db.query("update auth.users set confirmation_sent_at=now()-interval '26 hours' where id=$1", [user])
    } else await db.query(change, [user])
    expect(await take(user)).toBeNull()
  }
  expect(await rows()).toBe(0)
})

// Cross-device: sign up on a laptop, confirm on a phone. The phone has no sv_code cookie; the
// stored code is taken at the first verified sign-in and redeemed in the signup context.
it('a code stored at sign-up applies at the first verified sign-in on another device, once', async () => {
  const inviter = await createUser(db)
  const { code } = await row(db, 'select get_or_create_invite_code($1) as code', [inviter])
  const user = await justCreated()
  expect(await store(user, code)).toBe(true)
  await db.query("select grant_credits($1::uuid,6,'signup',$2,'free')", [user, 'signup:' + user])
  const taken = await take(user)
  expect(taken).toBe(code)
  const result = (await row(db, 'select redeem_code($1,$2,$3,null,$4) as r', [user, taken, 'signup', invite.windowDays])).r
  expect(result).toMatchObject({ status: 'ok', kind: 'invite' })
  expect(await take(user)).toBeNull()
})

it('is service role only, with no direct table access', async () => {
  for (const role of ['anon', 'authenticated']) {
    await db.query('savepoint s')
    await db.query(`set local role ${role}`)
    await expect(db.query('select signup_code_take(gen_random_uuid())')).rejects.toThrow(/permission denied/)
    await db.query('rollback to savepoint s')
  }
  await db.query('savepoint s')
  await db.query('set local role service_role')
  await expect(db.query('select * from signup_code_refs')).rejects.toThrow(/permission denied/)
  await db.query('rollback to savepoint s')
})
