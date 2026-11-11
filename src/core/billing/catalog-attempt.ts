import 'server-only'
import { createHash, randomUUID } from 'node:crypto'
import { z } from 'zod'
import type Stripe from 'stripe'

import { PRODUCT_IDS, type PaymentChannel, type SiteProduct } from '../config'
import { AppError } from '../errors'
import { callRpc, type RpcClient } from './rpc'
import type { BuyerQuote } from './buyer-quote'
import type { CheckoutBody } from './stripe/checkout'
import type { StripeApi } from './stripe/client'
import { expireAndRelease } from './stripe/checkout-discount'
import type { WaffoApi, WaffoSessionRequest } from './waffo/client'

export type Attempt = { token: string; hash: string; revision: number; body: CheckoutBody; quote: BuyerQuote }
type Saved = z.infer<typeof saved>
const saved = z.object({
  params: z.record(z.string(), z.unknown()),
  session_id: z.string().nullable(),
  session_url: z.string().nullable(),
})
const url = z.url({ protocol: /^https$/ })
const waffoResult = z.object({
  sessionId: z.string().startsWith('cs_'),
  checkoutUrl: url.refine((s) => /(^|\.)waffo\.ai$/.test(new URL(s).hostname)),
})

export function attemptIdentity(user: string, body: CheckoutBody, nonce: string | null) {
  const id = nonce ?? randomUUID()
  if (!z.uuid().safeParse(id).success) throw new AppError('INVALID_INPUT', 'Invalid checkout attempt')
  const hex = createHash('sha256')
    .update(user + ':' + id)
    .digest('hex')
  const token = [hex.slice(0, 8), hex.slice(8, 12), '5' + hex.slice(13, 16), '8' + hex.slice(17, 20), hex.slice(20, 32)].join('-')
  const hash = createHash('sha256').update(JSON.stringify(body)).digest('hex')
  return { token, hash }
}

export async function resumeAttempt(db: RpcClient, user: string, channel: PaymentChannel, id: { token: string; hash: string }) {
  return callRpc(
    db,
    'resume_catalog_checkout',
    { p_user: user, p_token: id.token, p_hash: id.hash, p_channel: channel },
    saved.nullable(),
  )
}

export function channelPrice(
  db: RpcClient,
  a: Attempt,
  channel: PaymentChannel,
  key: string,
  recurring: boolean,
  store?: { storeId: string; mode: string },
) {
  return callRpc(
    db,
    'catalog_channel_price',
    {
      p_product: a.body.product_id,
      p_revision: a.revision,
      p_channel: channel,
      p_key: key,
      p_recurring: recurring,
      p_store: store?.storeId ?? null,
      p_mode: store?.mode ?? null,
    },
    z.string().min(1).nullable(),
  )
}

type ProviderTerms = {
  channel: PaymentChannel
  key: string
  price: string
  recurring: boolean
  params: object
  store?: { storeId: string; mode: string }
}

export function lockAttempt(db: RpcClient, user: string, a: Attempt, terms: ProviderTerms) {
  return callRpc(
    db,
    'lock_catalog_checkout',
    {
      p_user: user,
      p_token: a.token,
      p_hash: a.hash,
      p_product: a.body.product_id,
      p_revision: a.revision,
      p_channel: terms.channel,
      p_key: terms.key,
      p_price: terms.price,
      p_unit: a.quote.price.cents,
      p_net: a.body.expected_price_cents,
      p_percent: a.quote.selectedCode?.percent ?? null,
      p_method: a.body.method,
      p_form: terms.recurring ? 'subscription' : 'one_time',
      p_params: terms.params,
      p_store: terms.store?.storeId ?? null,
      p_mode: terms.store?.mode ?? null,
    },
    saved,
  )
}

async function attach(db: RpcClient, user: string, token: string, session: string, target: string) {
  await callRpc(
    db,
    'attach_catalog_session',
    { p_user: user, p_token: token, p_session: session, p_url: target },
    z.literal(true),
  )
}

export async function finishStripe(db: RpcClient, stripe: StripeApi, user: string, token: string, row: Saved) {
  // The private row contains our server-built create params, including coupon, exact Price,
  // expiry and evidence. Always replay those bytes even if the buyer's IP or catalogue changed.
  const params = row.params as Stripe.Checkout.SessionCreateParams
  const sessionId = row.session_id ?? (await stripe.checkout.sessions.create(params, { idempotencyKey: token })).id
  // An idempotent POST can replay yesterday's open response after payment or expiration.
  const session = await stripe.checkout.sessions.retrieve(sessionId)
  const url = await openSessionUrl(db, stripe, user, token, params, session)
  if (!row.session_id) await attach(db, user, token, session.id, url)
  return { url, ...(params.metadata?.code_id && { cancelReceipt: token + ':' + session.id }) }
}

async function openSessionUrl(db: RpcClient, stripe: StripeApi, user: string, token: string, params: Stripe.Checkout.SessionCreateParams, session: Stripe.Checkout.Session) {
  try {
    if (session.status !== 'open' || !session.url) throw new AppError('CONFLICT', 'Checkout session is closed')
    assertProviderTerms(params, session)
    return session.url
  } catch (error) {
    if (params.metadata?.code_id) await expireAndRelease(stripe, db, user, token, session)
    throw error
  }
}

function assertProviderTerms(params: Stripe.Checkout.SessionCreateParams, session: Stripe.Checkout.Session) {
  const methods = params.allowed_payment_method_types
  if (methods?.length && !session.payment_method_types.some((m) => methods.includes(m))) {
    throw new AppError('INTERNAL', 'Stripe disabled the requested method')
  }
  if (params.metadata?.code_id && session.expires_at !== params.expires_at)
    throw new AppError('INTERNAL', 'Discount deadline differs from Stripe')
}

export async function finishWaffo(
  db: RpcClient,
  waffo: Pick<WaffoApi, 'createCheckoutSession'>,
  user: string,
  token: string,
  row: Saved,
) {
  if (row.session_url) return { url: row.session_url }
  const claim = await callRpc(
    db,
    'claim_waffo_catalog_session',
    { p_user: user, p_token: token },
    z.union([z.object({ url }), z.object({ pending: z.literal(true) }), z.object({ claimed: z.literal(true) })]),
  )
  if ('url' in claim) return { url: claim.url }
  if ('pending' in claim) throw new AppError('INTERNAL', 'Waffo checkout is still pending')
  const result = waffoResult.parse(await waffo.createCheckoutSession(row.params as unknown as WaffoSessionRequest))
  await attach(db, user, token, result.sessionId, result.checkoutUrl)
  return { url: result.checkoutUrl }
}

export function assertRevision(product: SiteProduct, revision: number, body: CheckoutBody) {
  const legacy = PRODUCT_IDS.some((id) => id === product.id) ? 2 : undefined
  if (revision !== (body.expected_revision ?? legacy))
    throw new AppError('CODE_CHECKOUT_OFFER_CHANGED', 'Review updated ' + product.id)
}
