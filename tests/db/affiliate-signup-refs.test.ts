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

const ref = (slug: string) => slug + '.' + Math.floor(Date.now() / 1000)
const store = async (user: string, value: string | null) =>
  (await row(db, 'select affiliate_signup_ref_store($1,$2) as stored', [user, value])).stored as boolean
const take = async (user: string) => (await row(db, 'select affiliate_signup_ref_take($1) as ref', [user])).ref as string | null

// An account the Auth API just created from the sign-up form: unconfirmed, never signed in.
async function justCreated() {
  const id = await createUser(db)
  await db.query('update auth.users set created_at=now(),email_confirmed_at=null,phone_confirmed_at=null,last_sign_in_at=null where id=$1', [id])
  return id
}

it('stores a just-created account\'s referral once, keeps the first, and hands it out once', async () => {
  const user = await justCreated()
  const first = ref('qa-anna')
  expect(await store(user, first)).toBe(true)
  expect(await store(user, ref('qa-bob'))).toBe(false)
  expect(await take(user)).toBe(first)
  expect(await take(user)).toBeNull()
})

it('stores nothing for a malformed value, an unknown account, or one that is not just created', async () => {
  const user = await justCreated()
  for (const value of [null, 'qa-anna', 'QA.1', 'qa-anna.x', 'a.1', "qa-anna.1'--"]) expect(await store(user, value)).toBe(false)
  expect(await store('00000000-0000-4000-8000-000000000000', ref('qa-anna'))).toBe(false)

  const cases = [
    'email_confirmed_at=now()',
    'phone_confirmed_at=now()',
    'last_sign_in_at=now()',
    "created_at=now()-interval '11 minutes'",
  ]
  for (const change of cases) {
    const other = await justCreated()
    await db.query(`update auth.users set ${change} where id=$1`, [other])
    expect(await store(other, ref('qa-anna'))).toBe(false)
  }
  expect(await row(db, 'select count(*)::int n from affiliate_signup_refs')).toEqual({ n: 0 })
})

it('the taken value binds through affiliate_bind as the cookie would, with its checks intact', async () => {
  const partner = await promoter(db)
  const user = await justCreated()
  await store(user, ref(partner.slug))
  const slug = (await take(user))!.split('.')[0]!
  expect(await bind(db, user, slug)).toBe(true)
  expect(await row(db, 'select referred_by,referred_source from profiles where id=$1', [user])).toEqual({ referred_by: partner.id, referred_source: 'signup' })
  // One binding per account: a second (another partner's) is refused.
  const other = await promoter(db)
  expect(await bind(db, user, other.slug)).toBe(false)
})

it('is gone with the account', async () => {
  const user = await justCreated()
  await store(user, ref('qa-anna'))
  await db.query('delete from auth.users where id=$1', [user])
  expect(await row(db, 'select count(*)::int n from affiliate_signup_refs')).toEqual({ n: 0 })
})

it('only the service role can read or write it', async () => {
  const table = await row(db, `select has_table_privilege('anon','public.affiliate_signup_refs','select') anon,
    has_table_privilege('authenticated','public.affiliate_signup_refs','select,insert,update,delete') signed,
    has_table_privilege('service_role','public.affiliate_signup_refs','select,insert,delete') service`)
  expect(table).toEqual({ anon: false, signed: false, service: true })
  for (const fn of ['public.affiliate_signup_ref_store(uuid,text)', 'public.affiliate_signup_ref_take(uuid)']) {
    const grants = await row(db, `select has_function_privilege('anon',$1,'execute') anon,
      has_function_privilege('authenticated',$1,'execute') signed, has_function_privilege('service_role',$1,'execute') service`, [fn])
    expect(grants).toEqual({ anon: false, signed: false, service: true })
  }
  expect(await row(db, "select relrowsecurity rls from pg_class where oid='public.affiliate_signup_refs'::regclass")).toEqual({ rls: true })
})
