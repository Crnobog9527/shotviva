import { randomUUID } from 'node:crypto'

import type { Client } from 'pg'
import type Stripe from 'stripe'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'

import { createCheckout, expireAndRelease } from '@/core/billing/stripe'
import { deps, fakeStripe } from '@/core/billing/stripe/test-checkout'
import { site } from '@/site/site.config'
import { benefits, invite, pack } from '../t94-config'

import { anonClient, connectAdmin, createUser, ledgerOf, profileOf, serviceClient } from './helpers'

let db: Client
beforeAll(async () => { db = await connectAdmin() })
afterAll(async () => { await db.end() })

const codeText = () => randomUUID().replaceAll('-', '').slice(0, 16).toUpperCase()

async function rpc(fn: string, args: Record<string, unknown>) {
  const { data, error } = await serviceClient().rpc(fn, args)
  if (error) throw new Error(error.message)
  return data
}

async function addDiscount(user: string) {
  const { rows: [code] } = await db.query<{ id: string; code: string }>(
    `insert into public.codes(code,kind,discount_percent,discount_products,discount_duration,stripe_coupon_id)
     values($1,'campaign',20,'{pack_s}','once',$2) returning id,code`, [codeText(), randomUUID()])
  const result = await rpc('redeem_code', {
    p_user: user, p_code: code.code, p_context: 'account', p_invitee_credits: invite.inviteeCredits, p_invite_window_days: invite.windowDays, p_replace: true,
  })
  expect(result).toMatchObject({ status: 'ok' })
  return code.id
}

async function addInvite(buyer: string, inviter: string) {
  await db.query("select public.grant_credits($1,$3,'signup',$2,'free')", [buyer, 'signup:' + buyer, benefits.freeCredits])
  const { rows: [offer] } = await db.query<{ code: string }>('select public.get_or_create_invite_code($1) as code', [inviter])
  expect(await rpc('redeem_code', {
    p_user: buyer, p_code: offer.code, p_context: 'signup', p_invitee_credits: invite.inviteeCredits, p_invite_window_days: invite.windowDays,
  })).toMatchObject({ status: 'ok' })
}

async function buy(buyer: string, cents = 990, channel: 'stripe' | 'waffo' = 'stripe') {
  const uid = randomUUID()
  if (channel === 'stripe') {
    await db.query("select public.settle_checkout($1,'pack_s',$2,$3,'usd',0,'card',null,$4)",
      [buyer, 'cs_' + uid, cents, 'ch_' + uid])
  } else {
    await db.query("select public.settle_waffo_order($1,'pack_s',$2,$3,$4,'usd',0,'card')",
      [buyer, 'PAY_' + uid, 'ORD_' + uid, cents])
  }
  const { rows: [payment] } = await db.query<{ id: string }>(
    'select id from public.payments where stripe_session_id = $1 or waffo_payment_id = $2', ['cs_' + uid, 'PAY_' + uid])
  return { buyer, id: payment.id, charge: 'ch_' + uid }
}

type Purchase = Awaited<ReturnType<typeof buy>>

function effects(payment: Purchase, code: string | null = null, amount = 0) {
  return rpc('apply_payment_code_effects', {
    p_user: payment.buyer, p_payment_id: payment.id, p_code_id: code, p_amount_discount: amount,
    p_inviter_credits: invite.inviterCredits, p_inviter_cap: invite.inviterRewardCap,
  })
}

const lookup = async (user: string, product = 'pack_s') =>
  (await db.query('select public.checkout_discount($1,$2) as value', [user, product])).rows[0].value
const reserve = (user: string, token: string) =>
  rpc('reserve_checkout_discount', { p_user: user, p_product_id: 'pack_s', p_token: token })
const prepare = (user: string, token: string, deadline: number) =>
  rpc('prepare_checkout_discount', { p_user: user, p_token: token, p_expires_at: deadline })
const release = (user: string, token: string) =>
  rpc('release_checkout_discount', { p_user: user, p_token: token })

it('shows only an eligible, pending coupon for the chosen product', async () => {
  const user = await createUser(db)
  const code = await addDiscount(user)
  expect(await lookup(user)).toMatchObject({ code_id: code, percent: 20 })
  expect(await lookup(user, 'max_yearly')).toBeNull()
  await db.query("update public.code_redemptions set discount_expires_at = now() - interval '1 second' where code_id = $1", [code])
  expect(await lookup(user)).toBeNull()
  await db.query('update public.code_redemptions set discount_expires_at = null, discount_void_at = now() where code_id = $1', [code])
  expect(await lookup(user)).toBeNull()
})

it('one live Checkout wins, repeats keep the deadline, and a stale release cannot cancel a new Checkout', async () => {
  const user = await createUser(db)
  const code = await addDiscount(user)
  const tokens = [randomUUID(), randomUUID()]
  const results = await Promise.all(tokens.map((token) => reserve(user, token)))
  const first = results.findIndex((result) => (result as { status: string }).status === 'reserved')
  expect(first).toBeGreaterThanOrEqual(0)
  const other = 1 - first
  expect(results[other]).toMatchObject({ status: 'in_use' })
  expect(await reserve(user, tokens[first])).toEqual(results[first])
  const now = Math.ceil(Date.now() / 1000)
  await expect(prepare(user, tokens[first], now + 3600)).rejects.toThrow('INVALID_CHECKOUT_DEADLINE')
  const deadline = now + 1805
  expect(await prepare(user, tokens[first], deadline)).toEqual({ status: 'prepared', expires_at: deadline })
  expect(await prepare(user, tokens[first], deadline + 2)).toEqual({ status: 'prepared', expires_at: deadline })
  expect(await reserve(user, tokens[first])).toMatchObject({ prepared: true, expires_at: deadline })
  expect(await release(user, tokens[other])).toBe(false)
  expect(await release(user, tokens[first])).toBe(true)
  expect(await reserve(user, tokens[other])).toMatchObject({ status: 'reserved' })
  await db.query("update public.code_redemptions set checkout_expires_at = now() - interval '1 second' where code_id = $1", [code])
  expect(await reserve(user, tokens[other])).toEqual({ status: 'expired' })
  expect(await reserve(user, randomUUID())).toMatchObject({ status: 'reserved' })
  expect(await release(user, tokens[other])).toBe(false)
})

it('opens only one discounted checkout across tabs, then immediately accepts a new one after cancellation', async () => {
  const user = await createUser(db)
  const codeId = await addDiscount(user)
  const { stripe } = fakeStripe()
  const codes = serviceClient()
  const create = vi.fn(async (params: Stripe.Checkout.SessionCreateParams) => ({
    id: 'cs_test_' + randomUUID().replaceAll('-', ''), status: 'open' as const, url: 'https://checkout.example/test',
    metadata: { user_id: user, checkout_token: String(params.metadata?.checkout_token), code_id: String(params.metadata?.code_id) },
    expires_at: params.expires_at!, payment_method_types: ['card'],
  }))
  const expire = vi.fn(async () => ({ status: 'expired' }))
  Object.assign(stripe.checkout.sessions, { create, expire })
  const config = deps(stripe, { codes, products: site.billing.products })
  const body = { product_id: pack.id, locale: 'en', method: 'card' } as const
  const start = () => createCheckout(config, { userId: user, body, token: randomUUID() })
  const before = Math.floor(Date.now() / 1000)
  const results = await Promise.allSettled([start(), start()])
  expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
  expect(results.find(result => result.status === 'rejected')?.reason).toMatchObject({ code: 'CODE_CHECKOUT_IN_PROGRESS' })
  expect(create).toHaveBeenCalledTimes(1)
  const session = (await create.mock.results[0].value)
  expect(session.metadata.code_id).toBe(codeId)
  expect(session.expires_at).toBeGreaterThanOrEqual(before + 1800)
  expect(session.expires_at).toBeLessThanOrEqual(Math.ceil(Date.now() / 1000) + 1810)
  const { rows: [lock] } = await db.query('select checkout_token, extract(epoch from checkout_expires_at)::bigint as expiry from code_redemptions where code_id=$1', [codeId])
  expect(lock.checkout_token).toBe(session.metadata.checkout_token)
  expect(Number(lock.expiry)).toBe(session.expires_at)
  await expireAndRelease(stripe, codes, user, lock.checkout_token, session)
  expect(expire).toHaveBeenCalledWith(session.id)
  expect(await start()).toHaveProperty('cancelReceipt')
  expect(create).toHaveBeenCalledTimes(2)
})

it('two successful discounted payments both settle, one consumes the claim and the other is flagged', async () => {
  const user = await createUser(db)
  const code = await addDiscount(user)
  const a = await buy(user, 792)
  const b = await buy(user, 792)
  const results = await Promise.all([effects(a, code, 198), effects(b, code, 198)])
  expect(results.map((result) => (result as { conflict: boolean }).conflict).sort()).toEqual([false, true])
  const { rows } = await db.query(
    'select id,amount_total,amount_discount,code_discount_conflict from public.payments where user_id = $1 order by code_discount_conflict', [user])
  expect(rows).toEqual([
    { id: expect.any(String), amount_total: 792, amount_discount: 198, code_discount_conflict: false },
    { id: expect.any(String), amount_total: 792, amount_discount: 198, code_discount_conflict: true },
  ])
  expect((await db.query('select discount_used_payment_id from public.code_redemptions where code_id = $1', [code])).rows)
    .toEqual([{ discount_used_payment_id: rows[0].id }])
  expect(await effects({ ...a, id: rows[1].id }, code, 198)).toEqual({ applied: false, rewarded: false, conflict: true })
  expect((await profileOf(db, user)).credits).toBe(pack.credits * 2)
  expect(await lookup(user)).toBeNull()
})

it('persists the original discounted payment even after replacement and leaves the new discount available', async () => {
  const user = await createUser(db)
  const old = await addDiscount(user)
  const current = await addDiscount(user)
  expect(await effects(await buy(user, 792), old, 198)).toMatchObject({ applied: true, conflict: false })
  expect(await lookup(user)).toMatchObject({ code_id: current })
})

it('rewards only the first settled payment even when callbacks run in reverse order; Waffo preserves the discount', async () => {
  const inviter = await createUser(db)
  const buyer = await createUser(db)
  await addInvite(buyer, inviter)
  const code = await addDiscount(buyer)
  const first = await buy(buyer, 990, 'waffo')
  const second = await buy(buyer)
  expect(await effects(second)).toMatchObject({ rewarded: false })
  const replay = await Promise.all([effects(first), effects(first)])
  expect(replay.map((row) => (row as { rewarded: boolean }).rewarded).sort()).toEqual([false, true])
  expect(await lookup(buyer)).toMatchObject({ code_id: code })
  expect((await profileOf(db, inviter)).credits).toBe(invite.inviterCredits)
  expect(await ledgerOf(db, inviter)).toEqual([expect.objectContaining({ kind: 'invite_reward', pool: 'paid', delta: invite.inviterCredits })])
  expect((await db.query('select public.current_tier($1) as tier', [inviter])).rows[0].tier).toBeNull()
})

it('a banned inviter receives no reward, including on replay after unban', async () => {
  const inviter = await createUser(db)
  const buyer = await createUser(db)
  await addInvite(buyer, inviter)
  await db.query('update public.profiles set banned_at = now() where id = $1', [inviter])
  const first = await buy(buyer)
  expect(await effects(first)).toMatchObject({ applied: true, rewarded: false })
  await db.query('update public.profiles set banned_at = null where id = $1', [inviter])
  expect(await effects(first)).toMatchObject({ applied: false, rewarded: false })
  expect(await ledgerOf(db, inviter)).toEqual([])
})

it('concurrent first purchases stop at the configured reward cap within its rolling window', async () => {
  const inviter = await createUser(db)
  const payments = []
  for (let i = 0; i <= invite.inviterRewardCap; i++) {
    const buyer = await createUser(db)
    await addInvite(buyer, inviter)
    payments.push(await buy(buyer))
  }
  const awarded = await Promise.all(payments.map((payment) => effects(payment)))
  const winners = awarded.filter((v) => (v as { rewarded: boolean }).rewarded)
  expect(winners).toHaveLength(invite.inviterRewardCap)
  expect((await profileOf(db, inviter)).credits).toBe(invite.inviterRewardCap * invite.inviterCredits)
  const winner = awarded.findIndex((v) => (v as { rewarded: boolean }).rewarded)
  await db.query('delete from auth.users where id = $1', [payments[winner].buyer])
  const afterDeletion = await createUser(db)
  await addInvite(afterDeletion, inviter)
  expect(await effects(await buy(afterDeletion))).toMatchObject({ rewarded: false })
  const { rows: [summary] } = await db.query(
    'select public.my_invite_summary($1,$2) as result', [inviter, invite.inviterRewardCap])
  await db.query("update public.credit_ledger set created_at = now() - make_interval(days => $2) where user_id = $1 and kind = 'invite_reward'",
    [inviter, summary.result.reward_window_days + 1])
  const blocked = awarded.findIndex((v) => !(v as { rewarded: boolean }).rewarded)
  expect(await effects(payments[blocked])).toMatchObject({ applied: false, rewarded: false })
  const next = await createUser(db)
  await addInvite(next, inviter)
  expect(await effects(await buy(next))).toMatchObject({ applied: true, rewarded: true })
}, 30_000)

it('T71 calculates full clawback against the discounted amount and leaves the discount spent', async () => {
  const buyer = await createUser(db)
  const code = await addDiscount(buyer)
  const purchase = await buy(buyer, 792)
  await effects(purchase, code, 198)
  const { rows: [refund] } = await db.query("select public.record_payment_issue($1,'refunded',792) as result", [purchase.charge])
  expect(refund.result).toMatchObject({ status: 'refunded', amount_refunded: 792, credits_clawed_back: pack.credits })
  expect((await profileOf(db, buyer)).credits).toBe(0)
  expect(await lookup(buyer)).toBeNull()
})

it('rejects client access, forged payment ownership and Waffo discount metadata', async () => {
  const buyer = await createUser(db)
  const outsider = await createUser(db)
  const code = await addDiscount(buyer)
  const order = await buy(buyer, 990, 'waffo')
  expect((await anonClient().rpc('reserve_checkout_discount', { p_user: buyer, p_product_id: 'pack_s', p_token: randomUUID() })).error).toBeTruthy()
  await expect(effects({ ...order, buyer: outsider })).rejects.toThrow('PAYMENT_NOT_FOUND')
  await expect(effects(order, code, 198)).rejects.toThrow('INVALID_INPUT')
})
