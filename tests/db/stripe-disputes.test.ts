import { randomUUID } from 'node:crypto'

import type { Client } from 'pg'
import type Stripe from 'stripe'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { captureAlert } from '@/core/analytics/capture-error'
import { handleStripeWebhook, submitEvidence, type DisputeEvidenceConfig } from '@/core/billing/stripe'

import { connectAdmin, createPricedTemplate, createUser, profileOf } from './helpers'
import { serviceSupabase } from './supabase-env'
import { chargeObject, checkoutSession, disputeObject, eventFor, signed, stripeHarness, type Harness } from './stripe-fixtures'

// T82 (ARCHITECTURE §6.3 「拒付申诉证据」, TASKS T82 单测): the checkout context lands on the
// payment row; a dispute is recorded once, bans the buyer (never an admin), stages the evidence
// with submit = false, and the Owner can submit it exactly once.

vi.mock('@/core/analytics/capture-error', () => ({ captureAlert: vi.fn(), captureError: vi.fn() }))

let db: Client
let h: Harness
let template: string

const evidence: DisputeEvidenceConfig = {
  managedPayments: true,
  adminOrigin: 'https://preview.example.app',
  context: (productId, charge) => ({
    brand: 'Shotviva',
    origin: 'https://shotviva.com',
    product: productId ? { name: `Shotviva ${productId}`, credits: 100, membership: null } : null,
    refundPolicyText: 'Refund Policy text',
    termsUrl: 'https://shotviva.com/terms',
    refundUrl: 'https://shotviva.com/refund-policy',
    charge,
  }),
}

beforeAll(async () => {
  db = await connectAdmin()
  template = await createPricedTemplate(db)
})

afterAll(async () => {
  await db.end()
})

beforeEach(() => {
  h = stripeHarness()
  h.deps.evidence = evidence
  vi.mocked(captureAlert).mockClear()
})

const deliver = (event: unknown) => handleStripeWebhook(h.deps, signed(event))

// A paid pack through the given route, opened from 203.0.113.7 with the Terms box ticked.
async function buyPack(method: 'card' | 'cn_card', options: { managed?: boolean; role?: 'admin' } = {}) {
  const userId = await createUser(db, { credits: 0 })
  if (options.role) await db.query("update public.profiles set role = 'admin' where id = $1", [userId])
  const charge = chargeObject({ amount: 990 })
  h.charges.set(charge.id, charge)
  const base = checkoutSession({ userId, productId: 'pack_s', method, charge })
  const session = {
    ...base,
    metadata: { ...base.metadata, buyer_ip: '203.0.113.7', buyer_ua: 'Mozilla/5.0 T82' },
    consent: { terms_of_service: 'accepted', promotions: null },
    managed_payments: { enabled: options.managed ?? false },
  } as unknown as Stripe.Checkout.Session
  h.sessions.set(session.id, session)
  await deliver(eventFor('checkout.session.completed', session.id))
  return { userId, charge }
}

async function makeWork(userId: string, source: 'web' | 'graylum' = 'web', ip = '203.0.113.7') {
  const jobId = randomUUID()
  const { error } = await serviceSupabase().rpc('reserve_credits', {
    p_job_id: jobId, p_user_id: userId, p_module: 'image', p_template_id: template, p_credits_cost: null, p_source: source, p_inputs: {}, p_client_ip: ip,
  })
  expect(error).toBeNull()
  await db.query("update public.generation_jobs set status = 'succeeded', output_key = 'x', finished_at = now() where id = $1", [jobId])
  return jobId
}

function openDisputeEvent(charge: Stripe.Charge) {
  const dispute = disputeObject(charge)
  h.disputes.set(dispute.id, dispute)
  return { dispute, event: eventFor('charge.dispute.created', dispute.id) }
}

const disputeRow = async (id: string) =>
  (await db.query('select responder, user_id, auto_banned_at, evidence_drafted_at, submitted_at, submitted_by from public.payment_disputes where stripe_dispute_id = $1', [id])).rows[0]

describe('checkout context on the payment row', () => {
  it('records the checkout IP, browser, Terms acceptance and route, and keeps the first on a replay', async () => {
    const { userId } = await buyPack('cn_card')
    const { rows } = await db.query('select host(purchase_ip) as ip, purchase_user_agent, terms_accepted_at, managed_payments from public.payments where user_id = $1', [userId])
    expect(rows).toEqual([{ ip: '203.0.113.7', purchase_user_agent: 'Mozilla/5.0 T82', terms_accepted_at: expect.any(Date), managed_payments: false }])
    const sessionId = (await db.query('select stripe_session_id from public.payments where user_id = $1', [userId])).rows[0].stripe_session_id
    await serviceSupabase().rpc('record_payment_context', { p_session_id: sessionId, p_ip: '198.51.100.9', p_user_agent: 'other' })
    expect((await db.query('select host(purchase_ip) as ip from public.payments where user_id = $1', [userId])).rows[0].ip).toBe('203.0.113.7')
  })
})

describe('works keep their IP and downloads', () => {
  it('reserve_credits stores a web request’s IP and never a partner call’s', async () => {
    const userId = await createUser(db, { credits: 20 })
    const web = await makeWork(userId, 'web')
    const partner = await makeWork(userId, 'graylum', '198.51.100.1')
    const { rows } = await db.query('select id, host(client_ip) as ip from public.generation_jobs where id = any($1)', [[web, partner]])
    expect(Object.fromEntries(rows.map((r) => [r.id, r.ip]))).toEqual({ [web]: '203.0.113.7', [partner]: null })
  })

  it('record_job_download keeps the first time and IP, counts each, and ignores other people’s works', async () => {
    const userId = await createUser(db, { credits: 20 })
    const jobId = await makeWork(userId)
    const rpc = (user: string, ip: string) => serviceSupabase().rpc('record_job_download', { p_job_id: jobId, p_user_id: user, p_ip: ip })
    expect((await rpc(userId, '203.0.113.7')).data).toBe(true)
    expect((await rpc(userId, '198.51.100.5')).data).toBe(true)
    expect((await rpc(randomUUID(), '198.51.100.6')).data).toBe(false)
    const { rows } = await db.query('select host(download_ip) as ip, download_count, downloaded_at from public.generation_jobs where id = $1', [jobId])
    expect(rows[0]).toEqual({ ip: '203.0.113.7', download_count: 2, downloaded_at: expect.any(Date) })
  })
})

describe('charge.dispute.created', () => {
  it('records the dispute, bans the buyer, stages the evidence as a draft and alerts once', async () => {
    const { userId, charge } = await buyPack('cn_card')
    await db.query('update public.profiles set credits = 20 where id = $1', [userId])
    await makeWork(userId)
    const { dispute, event } = openDisputeEvent(charge)

    expect((await deliver(event)).status).toBe(200)
    expect(await disputeRow(dispute.id)).toMatchObject({ responder: 'shotviva', user_id: userId, auto_banned_at: expect.any(Date), evidence_drafted_at: expect.any(Date), submitted_at: null })
    expect((await profileOf(db, userId)).banned_at).toEqual(expect.any(Date))
    const audit = await db.query("select reason from public.admin_audit_log where user_id = $1 and action = 'ban_user'", [userId])
    expect(audit.rows).toEqual([{ reason: '拒付' }])

    expect(h.disputeUpdate).toHaveBeenCalledTimes(1)
    const [, params] = h.disputeUpdate.mock.calls[0] as [string, Stripe.DisputeUpdateParams]
    expect(params.submit).toBe(false)
    expect(params.evidence).toMatchObject({ customer_purchase_ip: '203.0.113.7', customer_name: 'Test Buyer' })
    expect(params.evidence?.access_activity_log).toContain('Checkout browser: Mozilla/5.0 T82')
    expect(params.evidence?.access_activity_log).toContain('IP 203.0.113.7 · image created')
    expect(captureAlert).toHaveBeenCalledWith('dispute_opened', expect.stringContaining('https://preview.example.app/admin/disputes/'), expect.anything())

    // Redelivered: nothing new, no second ban row, no second draft or alert.
    vi.mocked(captureAlert).mockClear()
    await deliver(event)
    expect(h.disputeUpdate).toHaveBeenCalledTimes(1)
    expect((await db.query("select count(*)::int as n from public.admin_audit_log where user_id = $1 and action = 'ban_user'", [userId])).rows[0].n).toBe(1)
    expect(captureAlert).not.toHaveBeenCalledWith('dispute_opened', expect.anything(), expect.anything())
  })

  it('never bans an admin', async () => {
    const { userId, charge } = await buyPack('cn_card', { role: 'admin' })
    const { dispute, event } = openDisputeEvent(charge)
    await deliver(event)
    expect(await disputeRow(dispute.id)).toMatchObject({ auto_banned_at: null })
    expect((await profileOf(db, userId)).banned_at).toBeNull()
  })

  it('a Managed Payments card dispute is Stripe’s to answer: drafted, but cannot be submitted here', async () => {
    const { charge } = await buyPack('card', { managed: true })
    const { dispute, event } = openDisputeEvent(charge)
    await deliver(event)
    expect(await disputeRow(dispute.id)).toMatchObject({ responder: 'stripe', evidence_drafted_at: expect.any(Date) })
    const admin = await createUser(db)
    await db.query("update public.profiles set role = 'admin' where id = $1", [admin])
    await expect(submitEvidence({ stripe: h.stripe, db: serviceSupabase() }, { id: dispute.id, actorId: admin })).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('a draft that fails answers 500 and is drafted on the redelivery, banning only once', async () => {
    const { userId, charge } = await buyPack('cn_card')
    const { dispute, event } = openDisputeEvent(charge)
    h.disputeUpdate.mockRejectedValueOnce(new Error('stripe down'))
    expect((await deliver(event)).status).toBe(500)
    expect(await disputeRow(dispute.id)).toMatchObject({ evidence_drafted_at: null, auto_banned_at: expect.any(Date) })
    expect((await deliver(event)).status).toBe(200)
    expect(await disputeRow(dispute.id)).toMatchObject({ evidence_drafted_at: expect.any(Date) })
    expect((await db.query("select count(*)::int as n from public.admin_audit_log where user_id = $1 and action = 'ban_user'", [userId])).rows[0].n).toBe(1)
  })
})

describe('submitting evidence', () => {
  async function drafted() {
    const { charge } = await buyPack('cn_card')
    const { dispute, event } = openDisputeEvent(charge)
    await deliver(event)
    const admin = await createUser(db)
    await db.query("update public.profiles set role = 'admin' where id = $1", [admin])
    return { dispute, admin }
  }

  it('submits once with submit = true, records who and when, and refuses a second time', async () => {
    const { dispute, admin } = await drafted()
    const deps = { stripe: h.stripe, db: serviceSupabase() }
    await submitEvidence(deps, { id: dispute.id, actorId: admin })
    expect(h.disputeUpdate).toHaveBeenLastCalledWith(dispute.id, { submit: true })
    expect(await disputeRow(dispute.id)).toMatchObject({ submitted_at: expect.any(Date), submitted_by: admin })
    const audit = await db.query("select target_id from public.admin_audit_log where action = 'submit_dispute' and target_id = $1", [dispute.id])
    expect(audit.rows).toHaveLength(1)
    await expect(submitEvidence(deps, { id: dispute.id, actorId: admin })).rejects.toMatchObject({ code: 'CONFLICT' })
    expect(h.disputeUpdate).toHaveBeenCalledTimes(2)
  })

  it('admin_mark_dispute_submitted refuses a non-admin actor and a second mark', async () => {
    const { dispute, admin } = await drafted()
    const user = await createUser(db)
    const mark = (actor: string) => serviceSupabase().rpc('admin_mark_dispute_submitted', { p_dispute_id: dispute.id, p_actor: actor })
    expect((await mark(user)).error?.message).toBe('NOT_ADMIN')
    expect((await mark(admin)).error).toBeNull()
    expect((await mark(admin)).error?.message).toBe('DISPUTE_ALREADY_SUBMITTED')
  })

  it('claims the three-day reminder once', async () => {
    const { dispute } = await drafted()
    await db.query("update public.payment_disputes set due_by = now() + interval '2 days' where stripe_dispute_id = $1", [dispute.id])
    const claim = () => serviceSupabase().rpc('claim_dispute_reminders', { p_dispute_ids: [dispute.id] })
    expect((await claim()).data).toEqual([dispute.id])
    expect((await claim()).data).toEqual([])
  })

  it('the table and the functions are closed to signed-in users', async () => {
    const { rows } = await db.query("select has_table_privilege('authenticated', 'public.payment_disputes', 'select') as t, has_function_privilege('authenticated', 'public.admin_list_disputes(timestamptz, text, integer)', 'execute') as f")
    expect(rows[0]).toEqual({ t: false, f: false })
  })
})
