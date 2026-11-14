import type { Client } from 'pg'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { connectAdmin, createUser, ledgerOf, profileOf } from './helpers'

// Dangling 拍照识别 runs (1524–1525). PRICE is an abstract price for the test; the real one is
// the poster_photo_credits setting.
const PRICE = 3
let db: Client

const start = async (user: string) =>
  (await db.query<{ extraction_id: string }>('select * from public.start_poster_photo($1, $2, 30)', [user, 'decision/test'])).rows[0]!.extraction_id
const age = (id: string, minutes: number) =>
  db.query("update public.poster_extractions set created_at = now() - make_interval(mins => $2) where id = $1", [id, minutes])
const sweep = async (older = '10 minutes') =>
  (await db.query<{ refunded: number; skipped: number }>('select * from public.refund_stale_poster_photos($1::interval, 100)', [older])).rows[0]
const statusOf = async (id: string) => (await db.query<{ status: string }>('select status from public.poster_extractions where id = $1', [id])).rows[0]!.status

beforeAll(async () => { db = await connectAdmin() })
afterAll(async () => { await db.end() })
beforeEach(async () => {
  await db.query('begin')
  await db.query("insert into public.system_settings (key, value) values ('poster_photo_credits', $1) on conflict (key) do update set value = excluded.value", [String(PRICE)])
})
afterEach(async () => { await db.query('rollback') })

describe('refund_stale_poster_photos', () => {
  it('refunds charged runs pending past the age, once, and leaves fresh and finished runs alone', async () => {
    const user = await createUser(db, { credits: 10 })
    const dead = await start(user)
    const fresh = await start(user)
    const done = await start(user)
    await age(dead, 11)
    await age(done, 30)
    await db.query("update public.poster_extractions set status = 'ok' where id = $1", [done])
    expect((await profileOf(db, user)).credits).toBe(10 - 3 * PRICE)

    expect(await sweep()).toEqual({ refunded: 1, skipped: 0 })
    expect(await sweep()).toEqual({ refunded: 0, skipped: 0 })
    expect([await statusOf(dead), await statusOf(fresh), await statusOf(done)]).toEqual(['failed', 'pending', 'ok'])
    expect((await profileOf(db, user)).credits).toBe(10 - 2 * PRICE)
    expect((await ledgerOf(db, user)).filter((row) => row.kind === 'refund')).toEqual([
      { kind: 'refund', pool: 'paid', delta: PRICE, idempotency_key: `poster_photo:${dead}:refund` },
    ])
  })

  it('never refunds runs younger than 10 minutes, and is service role only', async () => {
    await db.query('savepoint young')
    await expect(sweep('5 minutes')).rejects.toThrow('INVALID_INPUT')
    await db.query('rollback to young')
    await db.query('savepoint roles')
    await db.query('set local role authenticated')
    await expect(sweep()).rejects.toThrow(/permission denied/)
    await db.query('rollback to roles')
  })
})
