import { randomUUID } from 'node:crypto'

import { createClient } from '@supabase/supabase-js'
import { Client } from 'pg'
import { afterAll, beforeAll, expect, it } from 'vitest'

import { deletePersonaUser } from '../../scripts/qa/users'
import type { QaStorage } from '../../scripts/qa/storage'
import { localSupabase } from './helpers'

// QA reset (scripts/qa) deletes persona accounts through the Auth admin API, the same way the
// app's account deletion does. A persona that opened a catalog checkout (T105 phase 2) and got a
// receipt and a contract must still be deletable, and nothing it owned may be left behind.
const { apiUrl, serviceRoleKey, dbUrl } = localSupabase()
const admin = createClient(apiUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
const db = new Client({ connectionString: dbUrl })
const storage: QaStorage = { enabled: false, put: async () => {}, deletePrefix: async () => {} }

beforeAll(() => db.connect())
afterAll(() => db.end())

it('deletes a QA persona that has a catalog checkout attempt, receipt and contract', async () => {
  const { data, error } = await admin.auth.admin.createUser({ email: `qa-catalog-${randomUUID()}@example.test`, email_confirm: true })
  if (error || !data.user) throw error ?? new Error('createUser returned no user')
  const user = data.user.id
  const token = randomUUID()
  await db.query(`insert into admin.catalog_checkout_attempts(token,user_id,product_id,revision,channel,request_hash,price_id,unit_cents,
    net_cents,credits,method,form,expires_at,params) values($1,$2,'pack_s',2,'stripe','qa-cleanup','price_QaCleanup',990,990,990,
    'card','one_time',now()+interval '1 hour','{}')`, [token, user])
  await db.query("insert into admin.catalog_receipts(event_key,token,initial_payment) values($1,$2,true)", [`qa-${token}`, token])
  await db.query("insert into admin.catalog_contracts(channel,subscription_id,token) values('stripe',$1,$2)", [`sub_qa_${token}`, token])

  await deletePersonaUser(admin, storage, user)

  const { rows } = await db.query(`select (select count(*) from public.profiles where id=$1)
    + (select count(*) from admin.catalog_checkout_attempts where token=$2)
    + (select count(*) from admin.catalog_receipts where token=$2)
    + (select count(*) from admin.catalog_contracts where token=$2) n`, [user, token])
  expect(Number(rows[0].n)).toBe(0)
})
