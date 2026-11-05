import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { connectAdmin } from './helpers'
import { linkedUser, linkRow } from './partner-fixtures'

// partner_links: users read their own row (never the code hash); nothing client-side writes.

let db: Client
let owner: string
let stranger: string

beforeAll(async () => {
  db = await connectAdmin()
  owner = await linkedUser(db)
  stranger = await linkedUser(db)
})

afterAll(async () => {
  await db.end()
})

async function asUser<T>(sub: string | null, run: () => Promise<T>) {
  await db.query('begin')
  try {
    await db.query(`set local role ${sub ? 'authenticated' : 'anon'}`)
    if (sub) await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub, role: 'authenticated' })])
    return await run()
  } finally {
    await db.query('rollback')
  }
}

describe('partner_links RLS', () => {
  it('shows a user only their own row', async () => {
    const rows = await asUser(owner, async () => (await db.query('select user_id, linked_at, revoked_at from public.partner_links')).rows)
    expect(rows.map((row) => row.user_id)).toEqual([owner])
  })

  it('never exposes the code hash to clients', async () => {
    await expect(asUser(owner, () => db.query('select link_code from public.partner_links'))).rejects.toThrow(/permission denied/)
  })

  it('lets no client write, not even to its own row', async () => {
    await expect(asUser(owner, () => db.query('update public.partner_links set revoked_at = null where user_id = $1', [owner]))).rejects.toThrow(/permission denied/)
    await expect(
      asUser(owner, () => db.query("insert into public.partner_links (user_id, partner) values ($1, 'graylum')", [stranger])),
    ).rejects.toThrow(/permission denied/)
    await expect(asUser(null, () => db.query('select user_id from public.partner_links'))).rejects.toThrow(/permission denied/)
  })

  it('goes away with the account (FK cascade)', async () => {
    const userId = await linkedUser(db)
    await db.query('delete from auth.users where id = $1', [userId])
    expect(await linkRow(db, userId)).toBeNull()
  })
})
