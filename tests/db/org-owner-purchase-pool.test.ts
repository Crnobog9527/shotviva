import { randomUUID } from 'node:crypto'

import type { Client } from 'pg'
import type Stripe from 'stripe'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { applyClawback, previewClawback } from '@/core/admin'
import { ORGS_COPY } from '@/core/admin/orgs/copy'
import { currentTier } from '@/core/billing'
import { handleStripeWebhook, priceCents, type DisputeEvidenceConfig } from '@/core/billing/stripe'
import type { ProductId } from '@/core/config'
import { allocateOrgCredits, depositOrgCredits } from '@/core/org'
import { site } from '@/site/site.config'

import { seedCatalogPolicy } from './catalog-policy'
import { connectAdmin, createUser, ledgerOf, profileOf, serviceClient } from './helpers'
import { adminAccount, creditsOf, member, orgLedger, orgWith, poolOf } from './org-fixtures'
import { serviceSupabase } from './supabase-env'
import {
  chargeObject,
  checkoutSession,
  disputeObject,
  eventFor,
  invoiceObject,
  signed,
  stripeHarness,
  subscriptionObject,
  type Harness,
} from './stripe-fixtures'

// Migration 2033 (Owner 2026-11-27, ARCHITECTURE §6.2 / §6.5): what an active org's main admin
// buys (Stripe one-off and subscription, Stripe renewals, Waffo one-time and recurring) settles
// straight into the org's paid pool, booked as a manual deposit; replays credit neither pool
// again; a suspended org or a buyer who is no longer the main admin keeps today's personal
// credit; refunds, disputes and the admin clawback take back from the org pool (never below 0,
// the allocated part written off) and a won dispute gives back to it.

vi.mock('@/core/analytics/capture-error', () => ({ captureAlert: vi.fn(), captureError: vi.fn() }))

const service = serviceClient()
let db: Client
let h: Harness
let actor: string

beforeAll(async () => {
  db = await connectAdmin()
  actor = await adminAccount(db, service)
})

afterAll(async () => {
  await db.end()
})

const evidence: DisputeEvidenceConfig = {
  managedPayments: false,
  context: (productId, charge) => ({
    brand: 'Shotviva',
    origin: 'https://shotviva.com',
    product: productId ? { name: `Shotviva ${productId}`, credits: 20, membership: null } : null,
    refundPolicyText: 'Refund Policy text',
    termsUrl: 'https://shotviva.com/terms',
    refundUrl: 'https://shotviva.com/refund-policy',
    charge,
  }),
}

beforeEach(() => {
  h = stripeHarness()
  h.deps.evidence = evidence
})

const deliver = (event: unknown) => handleStripeWebhook(h.deps, signed(event))
const cents = (productId: ProductId) => priceCents(site.billing.products.find((p) => p.id === productId)!)

async function buyPack(userId: string, productId: ProductId = 'pack_s') {
  const charge = chargeObject({ amount: cents(productId) })
  h.charges.set(charge.id, charge)
  const session = checkoutSession({ userId, productId, method: 'card', charge })
  h.sessions.set(session.id, session)
  const event = eventFor('checkout.session.completed', session.id)
  expect((await deliver(event)).body.outcome).toBe('applied')
  return { charge, session, event }
}

async function subscribe(userId: string, productId: ProductId = 'starter_monthly') {
  const subscription = subscriptionObject({ periodEndDays: 30, userId, productId })
  h.subscriptions.set(subscription.id, subscription)
  const first = invoiceObject({ subscription, billingReason: 'subscription_create', amountPaid: cents(productId), periodEndDays: 30 })
  h.invoices.set(first.id, first)
  const session = checkoutSession({ userId, productId, method: 'card', subscription, invoice: first })
  h.sessions.set(session.id, session)
  expect((await deliver(eventFor('checkout.session.completed', session.id))).body.outcome).toBe('applied')
  return { subscription, first, session }
}

const granted = async (key: string) =>
  (await db.query<{ delta: number }>("select delta from public.credit_ledger where idempotency_key = $1 and kind = 'purchase'", [key])).rows[0]!.delta

async function paymentOf(chargeId: string) {
  const { rows } = await db.query(
    'select id::text, status, credits_clawed_back, clawback_shortfall from public.payments where stripe_charge_id = $1',
    [chargeId],
  )
  return rows[0]
}

const deposits = async (userId: string) => (await ledgerOf(db, userId)).filter((row) => row.kind === 'org_deposit')

function refund(charge: Stripe.Charge, amountRefunded: number) {
  h.charges.set(charge.id, { ...charge, amount_refunded: amountRefunded, refunded: amountRefunded >= charge.amount })
  return eventFor('charge.refunded', charge.id)
}

describe('Stripe: the main admin buys into the org pool', () => {
  it('a pack: pool +N booked as owner_deposit, own balance unchanged; a replay credits neither pool', async () => {
    const { orgId, owner } = await orgWith(db, service, actor)
    const before = await creditsOf(db, owner)
    const { session, event } = await buyPack(owner)
    const n = await granted(`purchase:${session.id}`)
    expect(n).toBeGreaterThan(0)
    expect(await creditsOf(db, owner)).toBe(before)
    expect(await poolOf(db, orgId)).toBe(n)
    expect(await orgLedger(db, orgId)).toEqual([{ kind: 'owner_deposit', delta: n, pool_after: n, request_id: `pay:purchase:${session.id}` }])
    expect(await deposits(owner)).toEqual([{ kind: 'org_deposit', pool: 'paid', delta: -n, idempotency_key: `org:pay:purchase:${session.id}` }])

    expect((await deliver(event)).body.outcome).not.toBe('applied')
    await db.query("select * from public.settle_checkout($1,'pack_s',$2,990,'usd',0,'card')", [owner, session.id])
    expect(await poolOf(db, orgId)).toBe(n)
    expect(await creditsOf(db, owner)).toBe(before)
    expect(await deposits(owner)).toHaveLength(1)
  })

  it('a subscription: the credits go to the pool, the membership stays on the admin (paid_until, tier)', async () => {
    const { orgId, owner } = await orgWith(db, service, actor)
    const { session, subscription } = await subscribe(owner)
    const n = await granted(`purchase:${session.id}`)
    const profile = await profileOf(db, owner)
    expect(profile.credits).toBe(0)
    expect(profile.paid_until!.getTime()).toBeGreaterThan(Date.now() + 25 * 86_400_000)
    expect(await currentTier(service, owner)).toBe('starter')
    expect(await poolOf(db, orgId)).toBe(n)

    // The renewal (invoice.paid) lands in the pool too, once.
    const invoice = invoiceObject({ subscription, amountPaid: cents('starter_monthly'), periodEndDays: 60 })
    h.invoices.set(invoice.id, invoice)
    const paid = eventFor('invoice.paid', invoice.id)
    expect((await deliver(paid)).body.outcome).toBe('applied')
    await deliver(paid)
    const renewal = await granted(`renewal:${invoice.id}`)
    expect(await poolOf(db, orgId)).toBe(n + renewal)
    expect(await creditsOf(db, owner)).toBe(0)
    expect((await orgLedger(db, orgId)).map((row) => row.request_id)).toEqual([`pay:purchase:${session.id}`, `pay:renewal:${invoice.id}`])
    expect((await profileOf(db, owner)).paid_until!.getTime()).toBeGreaterThan(Date.now() + 55 * 86_400_000)
  })

  it('a suspended org at payment time: the credits go to the admin as before', async () => {
    const { orgId, owner } = await orgWith(db, service, actor)
    await db.query("update public.orgs set status = 'suspended' where id = $1", [orgId])
    const { session } = await buyPack(owner)
    expect(await creditsOf(db, owner)).toBe(await granted(`purchase:${session.id}`))
    expect(await poolOf(db, orgId)).toBe(0)
    expect(await deposits(owner)).toEqual([])
  })

  it('no longer the main admin at payment time: personal; the new main admin buys into the pool', async () => {
    const { orgId, owner, token } = await orgWith(db, service, actor)
    const next = await member(db, service, token)
    const { rows } = await db.query<{ at: string }>('select updated_at::text as at from public.orgs where id = $1', [orgId])
    await db.query('select public.admin_org_transfer_owner($1,$2)', [actor, { org_id: orgId, user_id: next, expected_updated_at: rows[0]!.at }])
    const old = await buyPack(owner)
    expect(await creditsOf(db, owner)).toBe(await granted(`purchase:${old.session.id}`))
    const fresh = await buyPack(next)
    expect(await creditsOf(db, next)).toBe(0)
    expect(await poolOf(db, orgId)).toBe(await granted(`purchase:${fresh.session.id}`))
  })

  it('a staff member’s payment (refused at checkout) would still settle personally', async () => {
    const { orgId, token } = await orgWith(db, service, actor)
    const staff = await member(db, service, token)
    await db.query("select * from public.settle_checkout($1,'pack_s',$2,990,'usd',0,'card')", [staff, `cs_${randomUUID()}`])
    expect(await creditsOf(db, staff)).toBeGreaterThan(0)
    expect(await poolOf(db, orgId)).toBe(0)
  })
})

describe('Waffo: one-time and recurring', () => {
  it('a one-time payment goes to the pool; the same payment id again credits nothing', async () => {
    const { orgId, owner } = await orgWith(db, service, actor)
    const pay = `PAY_${randomUUID()}`
    const settle = () => db.query("select (public.settle_waffo_order($1,'pack_s',$2,$3,990,'usd',0,'alipay')).applied as a", [owner, pay, `ORD_${randomUUID()}`])
    expect((await settle()).rows[0].a).toBe(true)
    expect((await settle()).rows[0].a).toBe(false)
    const n = await granted(`purchase:${pay}`)
    expect(await poolOf(db, orgId)).toBe(n)
    expect(await creditsOf(db, owner)).toBe(0)

    // A Waffo refund takes it back from the pool.
    await db.query("select public.record_waffo_refund($1,'RF_1',990)", [pay])
    expect(await poolOf(db, orgId)).toBe(0)
    expect((await orgLedger(db, orgId)).at(-1)).toMatchObject({ kind: 'payment_clawback', delta: -n, pool_after: 0 })
  })

  it('a recurring period (settle_waffo_renewal_v2) goes to the pool once', async () => {
    // In one transaction: the v2 catalogue switch must not leak into other test files.
    await db.query('begin')
    try {
      await seedCatalogPolicy(db)
      await db.query(`insert into public.system_settings(key,value) values('pricing_catalog_version','"v2"')
        on conflict(key) do update set value=excluded.value`)
      const owner = await createUser(db)
      const org = (await db.query('select public.admin_org_create($1,$2) as id', [actor, { owner_user_id: owner, name: 'Waffo org' }])).rows[0].id
      const renewal = () =>
        db.query(`select public.settle_waffo_renewal_v2($1,'pro_monthly','ORD_pool',2,'PAY_pool_cycle',$2,$2,0,$2,'usd') c`, [owner, cents('pro_monthly')])
      expect((await renewal()).rows[0].c.outcome).toBe('applied')
      expect((await renewal()).rows[0].c.outcome).toBe('replayed')
      const n = await granted('purchase:PAY_pool_cycle')
      expect(n).toBeGreaterThan(0)
      expect((await db.query('select pool_credits::int as p from public.orgs where id = $1', [org])).rows[0].p).toBe(n)
      expect(await creditsOf(db, owner)).toBe(0)
    } finally {
      await db.query('rollback')
    }
  })
})

describe('refunds and clawbacks take back from the org pool', () => {
  it('refund after allocation: takes what is left in the pool, writes off the rest; replays take nothing', async () => {
    const { orgId, owner, token } = await orgWith(db, service, actor)
    const staff = await member(db, service, token)
    const { charge, session } = await buyPack(owner)
    const n = await granted(`purchase:${session.id}`)
    await allocateOrgCredits(service, owner, staff, n - 5, randomUUID())
    expect(await poolOf(db, orgId)).toBe(5)

    const refunded = refund(charge, charge.amount)
    await deliver(refunded)
    await deliver(refunded)
    expect(await poolOf(db, orgId)).toBe(0)
    expect(await creditsOf(db, staff)).toBe(n - 5)
    expect(await creditsOf(db, owner)).toBe(0)
    expect(await paymentOf(charge.id)).toMatchObject({ status: 'refunded', credits_clawed_back: 5, clawback_shortfall: n - 5 })
    expect((await orgLedger(db, orgId)).filter((row) => row.kind === 'payment_clawback')).toEqual([
      expect.objectContaining({ delta: -5, pool_after: 0 }),
    ])
    expect((await ledgerOf(db, owner)).filter((row) => row.kind === 'clawback')).toEqual([])
  })

  it('refund_eligibility: the automatic deposit is not "used"; an allocation from the pool after the payment is', async () => {
    const { owner, token } = await orgWith(db, service, actor)
    const staff = await member(db, service, token)
    const { charge } = await buyPack(owner)
    const { id } = await paymentOf(charge.id)
    const used = async () => (await db.query('select no_credits_used from public.refund_eligibility($1, now())', [id])).rows[0].no_credits_used
    expect(await used()).toBe(true)
    // A later purchase's automatic deposit is not "used" either.
    await buyPack(owner)
    expect(await used()).toBe(true)
    await allocateOrgCredits(service, owner, staff, 1, randomUUID())
    expect(await used()).toBe(false)
  })

  it('dispute lost: everything left in the pool is taken and stays taken', async () => {
    const { orgId, owner } = await orgWith(db, service, actor)
    const { charge, session } = await buyPack(owner)
    const n = await granted(`purchase:${session.id}`)
    const opened = disputeObject(charge, { status: 'under_review' })
    h.disputes.set(opened.id, opened)
    await deliver(eventFor('charge.dispute.created', opened.id))
    expect(await poolOf(db, orgId)).toBe(0)
    expect(await paymentOf(charge.id)).toMatchObject({ status: 'disputed', credits_clawed_back: n })
    h.disputes.set(opened.id, { ...opened, status: 'lost' } as Stripe.Dispute)
    await deliver(eventFor('charge.dispute.closed', opened.id))
    expect(await poolOf(db, orgId)).toBe(0)
    expect(await creditsOf(db, owner)).toBe(0)
  })

  it('dispute won: the share comes back to the pool once', async () => {
    const { orgId, owner } = await orgWith(db, service, actor)
    const { charge, session } = await buyPack(owner)
    const n = await granted(`purchase:${session.id}`)
    const opened = disputeObject(charge, { status: 'under_review' })
    h.disputes.set(opened.id, opened)
    await deliver(eventFor('charge.dispute.created', opened.id))
    h.disputes.set(opened.id, { ...opened, status: 'won' } as Stripe.Dispute)
    const won = eventFor('charge.dispute.closed', opened.id)
    expect((await deliver(won)).body.outcome).toBe('kept')
    expect((await deliver(won)).body.outcome).toBe('replayed')
    expect(await poolOf(db, orgId)).toBe(n)
    expect(await creditsOf(db, owner)).toBe(0)
    expect(await paymentOf(charge.id)).toMatchObject({ status: 'paid', credits_clawed_back: 0, clawback_shortfall: 0 })
    expect((await orgLedger(db, orgId)).map((row) => [row.kind, row.delta])).toEqual([
      ['owner_deposit', n], ['payment_clawback', -n], ['payment_clawback_restore', n],
    ])
    // The owner's month panel counts both (org_pool_month).
    const period = new Date().toISOString().slice(0, 7)
    const month = (await db.query('select public.org_pool_month($1, $2) as m', [owner, period])).rows[0].m
    expect(month.paid).toMatchObject({ balance: n, in: n, clawed_back: n, restored: n })
  })

  it('the admin clawback previews and takes from the pool, naming the org', async () => {
    const { orgId, owner, token } = await orgWith(db, service, actor)
    const staff = await member(db, service, token)
    const { charge, session } = await buyPack(owner)
    const n = await granted(`purchase:${session.id}`)
    await allocateOrgCredits(service, owner, staff, 3, randomUUID())
    const { id } = await paymentOf(charge.id)
    const preview = await previewClawback(serviceSupabase(), id)
    expect(preview).toMatchObject({ granted: n, balance: n - 3, available: n - 3 })
    expect(preview.orgName).toMatch(/^Org /)
    expect(await applyClawback(serviceSupabase(), id, actor)).toEqual({ taken: n - 3, clawedBack: n - 3, shortfall: 0 })
    expect(await applyClawback(serviceSupabase(), id, actor)).toMatchObject({ taken: 0 })
    expect(await poolOf(db, orgId)).toBe(0)
    expect(await creditsOf(db, staff)).toBe(3)
  })

  it('a personal purchase deposited by hand still counts as used, and claws back from the admin', async () => {
    const { orgId, owner } = await orgWith(db, service, actor)
    await db.query("update public.orgs set status = 'suspended' where id = $1", [orgId])
    const { charge, session } = await buyPack(owner)
    await db.query("update public.orgs set status = 'active' where id = $1", [orgId])
    const n = await granted(`purchase:${session.id}`)
    await depositOrgCredits(service, owner, n, randomUUID())
    const { id } = await paymentOf(charge.id)
    expect((await db.query('select no_credits_used from public.refund_eligibility($1, now())', [id])).rows[0].no_credits_used).toBe(false)
    await deliver(refund(charge, charge.amount))
    // The credits were moved by hand: the payment is personal, so nothing comes from the pool.
    expect(await poolOf(db, orgId)).toBe(n)
    expect(await paymentOf(charge.id)).toMatchObject({ credits_clawed_back: 0, clawback_shortfall: n })
  })
})

describe('reserved request ids', () => {
  it('refuses pay: and payment_clawback ids from the owner functions', async () => {
    const { owner } = await orgWith(db, service, actor)
    await db.query('update public.profiles set credits = 10 where id = $1', [owner])
    await expect(depositOrgCredits(service, owner, 1, 'pay:purchase:cs_x')).rejects.toMatchObject({ message: 'INVALID_INPUT' })
    await expect(depositOrgCredits(service, owner, 1, 'payment_clawback:1:x')).rejects.toMatchObject({ message: 'INVALID_INPUT' })
  })
})

describe('labels', () => {
  it('the admin org ledger names every org_credit_ledger kind', async () => {
    const { rows } = await db.query<{ def: string }>(
      "select pg_get_constraintdef(oid) as def from pg_constraint where conname = 'org_credit_ledger_kind_check'")
    const kinds = [...rows[0]!.def.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]!)
    expect(kinds).toEqual(expect.arrayContaining(['payment_clawback', 'payment_clawback_restore']))
    expect(kinds.filter((kind) => !ORGS_COPY.kinds[kind])).toEqual([])
  })
})

// Review of #981 (P2-1): a dispute bans the buyer (profile) and claws back from the org pool;
// the org row must be taken first, as every org function does, or a concurrent allocation
// (org -> profile) deadlocks with it. Two committed sessions, opposite operations.
describe('lock order against a concurrent allocation', () => {
  let racer: Client
  let mover: Client
  beforeAll(async () => { [racer, mover] = await Promise.all([connectAdmin(), connectAdmin()]) })
  afterAll(async () => { await Promise.all([racer.end(), mover.end()]) })

  async function waitsOnLock(pid: number) {
    for (let i = 0; i < 100; i++) {
      const { rows } = await db.query("select wait_event_type = 'Lock' as waiting from pg_stat_activity where pid = $1", [pid])
      if (rows[0]?.waiting) return
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    throw new Error('never waited on a lock')
  }

  it('a dispute opened while the owner allocates: both complete, no deadlock', async () => {
    const { orgId, owner } = await orgWith(db, service, actor)
    const charge = `ch_${randomUUID()}`
    await db.query("select * from public.settle_checkout($1,'pack_s',$2,990,'usd',0,'card',null,$3)", [owner, `cs_${randomUUID()}`, charge])
    const n = await poolOf(db, orgId)
    expect(n).toBeGreaterThan(0)

    await mover.query('begin')
    await mover.query('select 1 from public.orgs where id = $1 for no key update', [orgId])
    const pid = (await racer.query('select pg_backend_pid() as pid')).rows[0].pid as number
    const dispute = racer.query("select public.open_payment_dispute($1,$2,990,'usd','fraudulent',now() + interval '7 days',false) as r",
      [`dp_${randomUUID()}`, charge])
    await waitsOnLock(pid)
    // org -> profile, the order of every org function: the dispute must not hold the profile now.
    await mover.query('select public.org_allocate($1,$1,1,$2)', [owner, `race:${randomUUID()}`])
    await mover.query('commit')
    await dispute

    expect(await poolOf(db, orgId)).toBe(0)
    expect(await creditsOf(db, owner)).toBe(1)
    const { rows } = await db.query('select credits_clawed_back, clawback_shortfall from public.payments where stripe_charge_id = $1', [charge])
    expect(rows[0]).toEqual({ credits_clawed_back: n - 1, clawback_shortfall: 1 })
  })
})
