import { randomUUID } from 'node:crypto'
import type { Client } from 'pg'
import { expect, it, vi } from 'vitest'
import { dispute, row } from './affiliate-fixtures'
import { connectAdmin, createUser, ledgerOf, profileOf } from './helpers'

// Hold the first writer uncommitted until the second has actually reached its charge lock.
// Each connection uses the real RPC, so this exercises MVCC as well as webhook replay keys.
it.each(['payment', 'dispute'])('pairs concurrent transactions when %s has not yet committed', async (first) => {
  const a = await connectAdmin()
  const b = await connectAdmin()
  try {
    const buyer = await createUser(a)
    const charge = 'ch_' + randomUUID()
    const session = 'cs_' + randomUUID()
    const pay = (db: Client) => db.query("select settle_checkout($1,'pack_s',$2,1040,'usd',50,'card',null,$3)", [buyer, session, charge])
    const { pid } = await row(b, 'select pg_backend_pid() as pid')
    await a.query('begin')
    if (first === 'payment') await pay(a)
    else await dispute(a, charge, 1040)
    const second = first === 'payment' ? dispute(b, charge, 1040) : pay(b)
    try {
      await vi.waitFor(async () => {
        expect((await row(a, 'select pg_backend_pid()=any(pg_blocking_pids($1)) as blocked', [pid])).blocked).toBe(true)
      })
    } finally {
      await a.query('commit')
      await second
    }
    const link = await row(a, `select d.payment_id=p.id as linked,d.user_id,d.credits_clawed_back,p.status
      from payment_disputes d join payments p using(stripe_charge_id) where p.stripe_charge_id=$1`, [charge])
    expect(link).toEqual({ linked: true, user_id: buyer, credits_clawed_back: 20, status: 'disputed' })
    expect((await profileOf(a, buyer)).credits).toBe(0)
    expect((await ledgerOf(a, buyer)).filter(l => l.kind === 'clawback')).toHaveLength(1)
  } finally {
    await a.query('rollback')
    await Promise.all([a.end(), b.end()])
  }
})

it('closes and restores when the first close read overlaps an uncommitted link', async () => {
  const a = await connectAdmin()
  const b = await connectAdmin()
  try {
    const buyer = await createUser(a)
    const charge = 'ch_' + randomUUID()
    const id = await dispute(a, charge, 1040)
    const { pid } = await row(b, 'select pg_backend_pid() as pid')
    await a.query('begin')
    await a.query("select settle_checkout($1,'pack_s',$2,1040,'usd',50,'card',null,$3)", [buyer, 'cs_' + randomUUID(), charge])
    const close = b.query("select close_payment_dispute($1,'won') as result", [id])
    try {
      await vi.waitFor(async () => {
        expect((await row(a, 'select pg_backend_pid()=any(pg_blocking_pids($1)) as blocked', [pid])).blocked).toBe(true)
      })
    } finally {
      await a.query('commit')
    }
    expect((await close).rows[0].result).toMatchObject({ first_close: true, user_id: buyer, product_id: 'pack_s', credits_restored: 20 })
    expect((await ledgerOf(a, buyer)).map(l => l.delta)).toEqual([20, -20, 20])
  } finally {
    await a.query('rollback')
    await Promise.all([a.end(), b.end()])
  }
})
