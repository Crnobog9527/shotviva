import type { Client } from 'pg'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest'

import { bind, promoter, row } from './affiliate-fixtures'
import { connectAdmin, createUser } from './helpers'

// The partner link stored at email sign-up (2021, ARCHITECTURE §6.5), for a verification opened
// on another device. Each test runs in a transaction that is rolled back. Fake data only.

let db: Client
beforeAll(async () => { db = await connectAdmin() })
beforeEach(async () => {
  await db.query('begin')
  await db.query('update affiliate_settings set enabled=true')
})
afterEach(async () => { await db.query('rollback') })
afterAll(async () => { await db.end() })

const store = async (user: string, slug: string | null) =>
  (await row(db, 'select affiliate_signup_ref_store($1,$2) as stored', [user, slug])).stored as boolean
const take = async (user: string) => (await row(db, 'select affiliate_signup_ref_take($1) as slug', [user])).slug as string | null
const rows = async () => (await row(db, 'select count(*)::int n from affiliate_signup_refs')).n as number

// An account the Auth API just created from the sign-up form: unconfirmed, never signed in, its
// confirmation email just sent.
async function justCreated() {
  const id = await createUser(db)
  await db.query(`update auth.users set created_at=now(),email_confirmed_at=null,phone_confirmed_at=null,last_sign_in_at=null,
    confirmation_sent_at=now()-interval '1 second' where id=$1`, [id])
  return id
}

it('the latest sign-up form for the account wins, and the slug is handed out once', async () => {
  const user = await justCreated()
  expect(await store(user, 'qa-anna')).toBe(true)
  expect(await store(user, 'qa-bob')).toBe(true)
  expect(await take(user)).toBe('qa-bob')
  expect(await take(user)).toBeNull()
  // A later form without a referral (or a staff link's) clears it.
  await store(user, 'qa-anna')
  expect(await store(user, null)).toBe(false)
  expect(await take(user)).toBeNull()
})

it('stores nothing for a malformed slug, an unknown account, or one that is not just created', async () => {
  const user = await justCreated()
  for (const value of ['QA', 'a', 'qa-anna.1', "qa'--"]) expect(await store(user, value)).toBe(false)
  expect(await store('00000000-0000-4000-8000-000000000000', 'qa-anna')).toBe(false)
  for (const change of ['email_confirmed_at=now()', 'phone_confirmed_at=now()', 'last_sign_in_at=now()', "created_at=now()-interval '11 minutes'"]) {
    const other = await justCreated()
    await db.query(`update auth.users set ${change} where id=$1`, [other])
    expect(await store(other, 'qa-anna')).toBe(false)
  }
  expect(await rows()).toBe(0)
})

// Review on #961 (P1): someone pre-registers a prospect's address with their own referral.
it('a squatted sign-up\'s referral never binds the real owner who signs up later', async () => {
  const user = await justCreated()
  expect(await store(user, 'qa-squatter')).toBe(true)
  // Days later the real owner submits the form for the same, still unconfirmed, address: GoTrue
  // returns the same user and sends a new email. Too old to store theirs, but the squatter's goes.
  await db.query("update auth.users set created_at=now()-interval '2 days', confirmation_sent_at=now()-interval '1 second' where id=$1", [user])
  expect(await store(user, 'qa-owner')).toBe(false)
  expect(await rows()).toBe(0)
  expect(await take(user)).toBeNull()
})

it('a row from before the latest confirmation email (a resend) is dropped unused', async () => {
  const user = await justCreated()
  await store(user, 'qa-squatter')
  await db.query("update auth.users set confirmation_sent_at=now()+interval '1 second' where id=$1", [user])
  expect(await take(user)).toBeNull()
  expect(await rows()).toBe(0)
})

// P2 and the second review: a row lives at most as long as a confirmation link (one day).
it('a row older than a day is dropped unused', async () => {
  const user = await justCreated()
  await store(user, 'qa-anna')
  await db.query("update affiliate_signup_refs set created_at=now()-interval '25 hours' where user_id=$1", [user])
  await db.query("update auth.users set confirmation_sent_at=now()-interval '26 hours' where id=$1", [user])
  expect(await take(user)).toBeNull()
  expect(await rows()).toBe(0)
})

// Second review on #961: other first verifications of a squatted, unconfirmed account.
it('a password reset or email change sent after the row, or a linked Google account, drops it unused', async () => {
  const cases = [
    "update auth.users set recovery_sent_at=now()+interval '1 second' where id=$1",
    "update auth.users set email_change_sent_at=now()+interval '1 second' where id=$1",
    `insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
     values ($1::text, $1::uuid, jsonb_build_object('sub', $1::text), 'google', now(), now(), now())`,
  ]
  for (const change of cases) {
    const user = await justCreated()
    expect(await store(user, 'qa-squatter')).toBe(true)
    await db.query(change, [user])
    expect(await take(user)).toBeNull()
  }
  expect(await rows()).toBe(0)
})

it('an email identity, or a reset sent before the row, does not stop it', async () => {
  const user = await justCreated()
  await db.query(`insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values ($1::text, $1::uuid, jsonb_build_object('sub', $1::text), 'email', null, now(), now())`, [user])
  await db.query("update auth.users set recovery_sent_at=now()-interval '1 minute' where id=$1", [user])
  await store(user, 'qa-anna')
  expect(await take(user)).toBe('qa-anna')
})

it('the taken slug binds through affiliate_bind as the cookie would, with its checks intact', async () => {
  const partner = await promoter(db)
  const user = await justCreated()
  await store(user, partner.slug)
  expect(await bind(db, user, (await take(user))!)).toBe(true)
  expect(await row(db, 'select referred_by,referred_source from profiles where id=$1', [user])).toEqual({ referred_by: partner.id, referred_source: 'signup' })
  // One binding per account: a second (another partner's) is refused.
  const other = await promoter(db)
  expect(await bind(db, user, other.slug)).toBe(false)
})

it('is gone with the account', async () => {
  const user = await justCreated()
  await store(user, 'qa-anna')
  await db.query('delete from auth.users where id=$1', [user])
  expect(await rows()).toBe(0)
})

it('only the service role can call the functions, and nobody can touch the table directly', async () => {
  const table = await row(db, `select has_table_privilege('anon','public.affiliate_signup_refs','select,insert,update,delete') anon,
    has_table_privilege('authenticated','public.affiliate_signup_refs','select,insert,update,delete') signed,
    has_table_privilege('service_role','public.affiliate_signup_refs','select,insert,update,delete') service`)
  expect(table).toEqual({ anon: false, signed: false, service: false })
  for (const fn of ['public.affiliate_signup_ref_store(uuid,text)', 'public.affiliate_signup_ref_take(uuid)']) {
    const grants = await row(db, `select has_function_privilege('anon',$1,'execute') anon,
      has_function_privilege('authenticated',$1,'execute') signed, has_function_privilege('service_role',$1,'execute') service`, [fn])
    expect(grants).toEqual({ anon: false, signed: false, service: true })
  }
  expect(await row(db, "select relrowsecurity rls from pg_class where oid='public.affiliate_signup_refs'::regclass")).toEqual({ rls: true })
})
