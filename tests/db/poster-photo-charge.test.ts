import type { Client } from 'pg'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { connectAdmin, createUser, ledgerOf, profileOf } from './helpers'

// 拍照识别's charge (1521–1523). PRICE is an abstract price for the test; the real one is the
// poster_photo_credits setting each site saves on /admin/features.
const PRICE = 3
let db: Client

const start = (user: string, perHour = 30) =>
  db.query<{ extraction_id: string; credits: number }>('select * from public.start_poster_photo($1, $2, $3)', [user, 'decision/test', perHour])
const refund = (id: string) => db.query('select public.refund_poster_photo($1, 120, 10, 5, 0.001)', [id])
const setPrice = (value: unknown) => db.query(
  "insert into public.system_settings (key, value) values ('poster_photo_credits', $1) on conflict (key) do update set value = excluded.value", [JSON.stringify(value)])

beforeAll(async () => { db = await connectAdmin() })
afterAll(async () => { await db.end() })
beforeEach(async () => {
  await db.query('begin')
  await setPrice(PRICE)
})
afterEach(async () => { await db.query('rollback') })

describe('start_poster_photo', () => {
  it('takes the price from the paid pool first, in one ledger row, with a pending run', async () => {
    const user = await createUser(db, { credits: 10, freeCredits: 10 })
    const { rows: [run] } = await start(user)
    expect(run).toMatchObject({ credits: PRICE })
    expect(await profileOf(db, user)).toMatchObject({ credits: 10 - PRICE, free_credits: 10 })
    expect(await ledgerOf(db, user)).toEqual([{ kind: 'reserve', pool: 'paid', delta: -PRICE, idempotency_key: `poster_photo:${run!.extraction_id}:reserve` }])
    const { rows: [row] } = await db.query('select source, status, credits, credit_pool from public.poster_extractions where id = $1', [run!.extraction_id])
    expect(row).toEqual({ source: 'photo', status: 'pending', credits: PRICE, credit_pool: 'paid' })
  })

  it('uses the free pool when paid cannot cover it, and refuses when neither can', async () => {
    const user = await createUser(db, { credits: PRICE - 1, freeCredits: PRICE })
    await start(user)
    expect(await profileOf(db, user)).toMatchObject({ credits: PRICE - 1, free_credits: 0 })
    await expect(start(user)).rejects.toThrow('CREDITS_INSUFFICIENT')
  })

  it('charges nothing without a price, and stops at the hourly limit', async () => {
    const user = await createUser(db, { credits: 100 })
    await db.query("delete from public.system_settings where key = 'poster_photo_credits'")
    await db.query('savepoint unset')
    await expect(start(user)).rejects.toThrow('PRICE_UNSET')
    await db.query('rollback to unset')
    await setPrice(PRICE)
    await start(user, 2)
    await start(user, 2)
    await db.query('savepoint over_limit')
    await expect(start(user, 2)).rejects.toThrow('RATE_LIMITED')
    await db.query('rollback to over_limit')
    expect((await profileOf(db, user)).credits).toBe(100 - 2 * PRICE)
  })
})

describe('refund_poster_photo', () => {
  it('gives a failed run back to its pool once, and never refunds an ok run', async () => {
    const user = await createUser(db, { freeCredits: PRICE })
    const { rows: [run] } = await start(user)
    await refund(run!.extraction_id)
    await refund(run!.extraction_id)
    expect(await profileOf(db, user)).toMatchObject({ free_credits: PRICE })
    expect((await ledgerOf(db, user)).map((row) => [row.kind, row.pool, row.delta])).toEqual([['reserve', 'free', -PRICE], ['refund', 'free', PRICE]])
    const { rows: [row] } = await db.query('select status, input_chars, input_tokens from public.poster_extractions where id = $1', [run!.extraction_id])
    expect(row).toEqual({ status: 'failed', input_chars: 120, input_tokens: 10 })

    const other = await createUser(db, { credits: PRICE })
    const { rows: [done] } = await start(other)
    await db.query("update public.poster_extractions set status = 'ok' where id = $1", [done!.extraction_id])
    await expect(refund(done!.extraction_id)).rejects.toThrow('JOB_ALREADY_SETTLED')
  })

  it('is service role only', async () => {
    const user = await createUser(db, { credits: PRICE })
    await db.query('savepoint roles')
    await db.query('set local role authenticated')
    await expect(start(user)).rejects.toThrow(/permission denied/)
    await db.query('rollback to roles')
  })
})

describe('admin_set_system_setting poster_photo_credits', () => {
  it('takes a whole number from 1 to 1000 from an admin', async () => {
    const admin = await createUser(db)
    await db.query("update public.profiles set role = 'admin' where id = $1", [admin])
    await db.query("select public.admin_set_system_setting('poster_photo_credits', '5'::jsonb, $1)", [admin])
    for (const bad of ['0', '1.5', '1001', '"5"']) {
      await db.query('savepoint bad')
      await expect(db.query("select public.admin_set_system_setting('poster_photo_credits', $2::jsonb, $1)", [admin, bad])).rejects.toThrow('INVALID_INPUT')
      await db.query('rollback to bad')
    }
  })
})
