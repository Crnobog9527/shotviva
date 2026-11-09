import { createHash } from 'node:crypto'
import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { GET } from '@/app/api/affiliate/commissions/route'
import { readChanges, readCommissions, readReferrals } from '@/core/affiliate/partners/repository'
import { connectAdmin, createUser } from './helpers'
import { promoter } from './affiliate-fixtures'
import { serviceSupabase } from './supabase-env'

// Only HTTP session and locale context are injected. The same PostgREST queries and service-role
// permissions used by the server run against the local Supabase stack, including the CSV stream.
const auth = vi.hoisted(() => ({ id: '' }))
vi.mock('@/core/auth', () => ({
  createAdminSupabase: () => serviceSupabase(),
  requireApiUser: async () => ({ id: auth.id, verified: true }),
}))
vi.mock('@/core/affiliate/feature', () => ({ isAffiliateEnabled: async () => true }))
vi.mock('next-intl/server', () => ({
  getTranslations: async () => Object.assign((key: string) => key, { has: () => true }),
}))

async function fixture(db: Client, product: string) {
  const owner = await promoter(db)
  const buyer = await createUser(db)
  const {
    rows: [payment],
  } = await db.query(
    "insert into payments(user_id,product_id,amount_total,channel,method,currency,stripe_session_id) values($1,$2,100,'stripe','card','usd',$3) returning id",
    [buyer, product, 'cs_' + buyer],
  )
  const {
    rows: [commission],
  } = await db.query(
    `insert into affiliate_commissions(payment_id,affiliate_user_id,level,product_id,rate_bp,base_usd,amount,status,confirm_after)
     values($1,$2,1,$3,1500,100,15,'pending',now()) returning id`,
    [payment.id, owner.id, product],
  )
  await db.query(
    "insert into affiliate_commission_changes(commission_id,new_amount,new_status,reason) values($1,15,'pending','payment')",
    [commission.id],
  )
  await db.query("update profiles set referred_by=$1,referred_at=now(),referred_source='admin' where id=$2", [
    owner.id,
    buyer,
  ])
  return { user: owner.id, buyer, commission: String(commission.id) }
}

describe('partner data isolation', () => {
  let db: Client
  let a: Awaited<ReturnType<typeof fixture>>
  let b: typeof a
  beforeAll(async () => {
    db = await connectAdmin()
    a = await fixture(db, 'pack_s')
    b = await fixture(db, 'pack_l')
    auth.id = a.user
  })
  afterAll(async () => {
    const ids = [a?.buyer, b?.buyer, a?.user, b?.user].filter(Boolean)
    if (ids.length) await db.query('delete from auth.users where id=any($1::uuid[])', [ids])
    await db.end()
  })
  it('scopes the commission list and rejects another owner’s change history', async () => {
    expect((await readCommissions(a.user)).items.map((r) => r.product_id)).toEqual(['pack_s'])
    expect((await readChanges(a.user, a.commission)).items).toHaveLength(1)
    expect((await readChanges(a.user, b.commission)).items).toEqual([])
  })
  it('returns exactly the six-character digest and no customer UUID, name or email', async () => {
    const data = await readReferrals(a.user)
    const mask = createHash('sha256').update(a.buyer).digest('hex').slice(0, 6)
    expect(data.items).toEqual([{ mask, date: expect.any(String), count: 1, amount: 15 }])
    expect(JSON.stringify(data)).not.toContain(a.buyer)
  })
  it('ignores a forged affiliate ID when exporting through the public route', async () => {
    const r = await GET(new Request('https://example.test/api/affiliate/commissions?affiliate_user_id=' + b.user))
    expect(r.status).toBe(200)
    expect(r.headers.get('cache-control')).toContain('no-store')
    const csv = await r.text()
    expect(csv).toContain('pack_s')
    expect(csv).not.toContain('pack_l')
    expect(csv).not.toContain('@')
    expect(csv).not.toContain(a.buyer)
    expect(csv.trim().split('\r\n')).toHaveLength(2)
  })
})
