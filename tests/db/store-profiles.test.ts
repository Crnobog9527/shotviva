import type { Client } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { connectAdmin, createUser } from './helpers'

// 店铺信息 (1510): the owner reads their own row; only the server writes; the QR key must sit
// under the owner's own outputs/ prefix.
let db: Client
let owner: string
let stranger: string

const qrKey = (user: string) => `outputs/${user}/store-qr-22222222-2222-4222-8222-222222222222.jpg`

async function as<T>(role: 'authenticated' | 'service_role', sub: string | null, run: () => Promise<T>) {
  await db.query('begin')
  try {
    await db.query(`set local role ${role}`)
    if (sub) await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub, role })])
    return await run()
  } finally {
    await db.query('rollback')
  }
}

const insert = (user: string, key: string | null = qrKey(user)) =>
  db.query("insert into public.store_profiles (user_id, name, phones, qr_key) values ($1, '星澜', array['138'], $2)", [user, key])

beforeAll(async () => { db = await connectAdmin() })
afterAll(async () => {
  await db.query('delete from public.store_profiles where user_id = any($1)', [[owner, stranger]])
  await db.end()
})
beforeEach(async () => {
  owner = await createUser(db)
  stranger = await createUser(db)
  await insert(owner)
  await insert(stranger)
})

describe('store_profiles', () => {
  it('shows a signed-in user only their own row', async () => {
    const rows = await as('authenticated', owner, async () => (await db.query('select user_id, name from public.store_profiles')).rows)
    expect(rows).toEqual([{ user_id: owner, name: '星澜' }])
  })

  it('lets no client write, not even its own row', async () => {
    await expect(as('authenticated', owner, () => db.query("update public.store_profiles set name = 'x' where user_id = $1", [owner]))).rejects.toThrow(/permission denied/)
    await expect(as('authenticated', owner, () => db.query('delete from public.store_profiles where user_id = $1', [owner]))).rejects.toThrow(/permission denied/)
  })

  it('takes a QR key only under the owner\'s own prefix, and at most three phones', async () => {
    await expect(as('service_role', null, () => db.query('update public.store_profiles set qr_key = $2 where user_id = $1', [owner, qrKey(stranger)]))).rejects.toThrow(/check constraint/)
    await expect(as('service_role', null, () => db.query("update public.store_profiles set phones = array['1','2','3','4'] where user_id = $1", [owner]))).rejects.toThrow(/check constraint/)
    await expect(as('service_role', null, () => db.query("update public.store_profiles set qr_key = $2, phones = array['1','2','3'] where user_id = $1", [owner, qrKey(owner)]))).resolves.toBeTruthy()
  })

  it('goes with the account', async () => {
    await db.query('delete from auth.users where id = $1', [owner])
    const { rows } = await db.query('select 1 from public.store_profiles where user_id = $1', [owner])
    expect(rows).toEqual([])
  })
})
