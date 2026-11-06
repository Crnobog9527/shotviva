import { randomUUID } from 'node:crypto'

import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { listSignupClusters, loadUser, loadUserExtras, lookupUser } from '@/core/admin'
import { reserveJob } from '@/core/jobs'

import { connectAdmin, createPricedTemplate, createUser } from './helpers'
import { serviceSupabase } from './supabase-env'

// T25 admin_lookup: every input shape finds its user (ARCHITECTURE §10「万能查找」), plus the
// user detail blocks and 「可疑注册」 reading what the lookup ids point at.

let db: Client
let user: string
let email: string
let jobId: string
const service = serviceSupabase()
const uid = () => randomUUID().replaceAll('-', '').slice(0, 20)
const ids = { session: `cs_test_${uid()}`, invoice: `in_${uid()}`, charge: `ch_${uid()}`, sub: `sub_${uid()}`, waffo: `WF${uid()}`, oldSession: `cs_test_${uid()}` }

beforeAll(async () => {
  db = await connectAdmin()
  user = await createUser(db, { credits: 5 })
  email = (await db.query<{ email: string }>('select email from auth.users where id = $1', [user])).rows[0]!.email
  jobId = randomUUID()
  await reserveJob(service, { jobId, userId: user, module: 'image', templateId: await createPricedTemplate(db), source: 'web', inputs: { resolution: '1k' } })
  await db.query(
    `insert into public.payments (user_id, product_id, channel, stripe_session_id, stripe_invoice_id, stripe_charge_id, amount_total, amount_tax, currency, method)
     values ($1, 'pack_s', 'stripe', $2, null, $3, 990, 0, 'usd', 'card'),
            ($1, 'pro_monthly', 'stripe', null, $4, null, 1290, 100, 'usd', 'card')`,
    [user, ids.session, ids.charge, ids.invoice],
  )
  await db.query(`insert into public.payments (user_id, product_id, channel, waffo_order_id, amount_total, currency, method) values ($1, 'pack_m', 'waffo', $2, 2490, 'usd', 'alipay')`, [user, ids.waffo])
  await db.query(
    `insert into public.subscriptions (stripe_subscription_id, user_id, product_id, status, current_period_end) values ($1, $2, 'pro_monthly', 'active', now() + interval '20 days')`,
    [ids.sub, user],
  )
  // A checkout settled before T10: only the ledger row knows it.
  await db.query(
    `insert into public.credit_ledger (user_id, pool, kind, delta, balance_after, reason, idempotency_key, product_id) values ($1, 'paid', 'purchase', 20, 25, 'purchase pack_s', $2, 'pack_s')`,
    [user, `purchase:${ids.oldSession}`],
  )
})

afterAll(async () => {
  await db.end()
})

describe('admin_lookup', () => {
  it.each([
    ['user id', () => user, 'user', null],
    ['job id', () => jobId, 'job', 'job'],
    ['checkout session', () => ids.session, 'checkout', null],
    ['pre-T10 checkout (ledger only)', () => ids.oldSession, 'checkout', null],
    ['invoice', () => ids.invoice, 'invoice', null],
    ['charge', () => ids.charge, 'charge', null],
    ['subscription', () => ids.sub, 'subscription', null],
    ['Waffo order', () => ids.waffo, 'waffo', null],
    ['unique email substring', () => email.slice(0, 20).toUpperCase(), 'email', null],
  ] as const)('finds the user from a %s', async (_label, query, kind, withJob) => {
    const hit = await lookupUser(service, `  ${query()}  `)
    expect(hit).toEqual({ kind, userId: user, jobId: withJob ? jobId : null })
  })

  it('answers nothing for unknown ids, a shared email fragment and a blank query', async () => {
    expect(await lookupUser(service, randomUUID())).toBeNull()
    expect(await lookupUser(service, 'cs_test_missing')).toBeNull()
    expect(await lookupUser(service, 'example.test')).toBeNull()
    expect(await lookupUser(service, '   ')).toBeNull()
  })

  it('is service-role only', async () => {
    const { anonSupabase } = await import('./supabase-env')
    const { error } = await anonSupabase().rpc('admin_lookup', { p_query: user })
    expect(error?.message).toMatch(/permission denied/)
  })
})

describe('user detail blocks', () => {
  it('reads payments newest first, the subscription, and the same-IP accounts', async () => {
    const ip = `198.51.100.${Math.floor(Math.random() * 200) + 20}`
    const twin = await createUser(db)
    await db.query('update public.profiles set signup_ip = $2 where id = any($1)', [[user, twin], ip])
    const profile = await loadUser(service, user)
    expect(profile?.signupIp).toBe(ip)
    const extras = await loadUserExtras(service, profile!)
    expect(extras.payments.map((p) => p.productId).sort()).toEqual(['pack_m', 'pack_s', 'pro_monthly'])
    expect(extras.payments.find((p) => p.productId === 'pack_s')).toMatchObject({ providerId: ids.session, chargeId: ids.charge, amountTotal: 990 })
    expect(extras.subscription.subscriptions).toEqual([expect.objectContaining({ id: ids.sub, status: 'active' })])
    expect(extras.graylum).toBeNull()
    expect(extras.sameIp.map((a) => a.id)).toEqual([twin])
    expect(extras.requests).toEqual([])
  })
})

describe('admin_signup_ip_clusters', () => {
  it('lists an IP with 3 recent signups and its accounts, not one with 2', async () => {
    const busy = `203.0.113.${Math.floor(Math.random() * 200) + 20}`
    const quiet = `192.0.2.${Math.floor(Math.random() * 200) + 20}`
    const members = [await createUser(db, { freeCredits: 6 }), await createUser(db), await createUser(db)]
    await db.query('update public.profiles set signup_ip = $2 where id = any($1)', [members, busy])
    await db.query('update public.profiles set signup_ip = $2 where id = any($1)', [[await createUser(db), await createUser(db)], quiet])
    const clusters = await listSignupClusters(service, 1)
    const cluster = clusters.find((c) => c.ip === busy)
    expect(cluster?.accounts).toBe(3)
    expect(cluster?.members.map((m) => m.id).sort()).toEqual([...members].sort())
    expect(cluster?.members.find((m) => m.id === members[0])).toMatchObject({ freeCredits: 6, freeUsed: 0, bannedAt: null })
    expect(clusters.some((c) => c.ip === quiet)).toBe(false)
  })

  it('takes only 1 or 7 days', async () => {
    const { error } = await service.rpc('admin_signup_ip_clusters', { p_days: 30 })
    expect(error?.message).toBe('INVALID_INPUT')
  })
})
