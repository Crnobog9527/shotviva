import { z } from 'zod'

import { PRODUCT_IDS, type ProductId } from './config/define-site'

// Waffo, the fallback channel (T13; card memberships auto-renew since T50, ARCHITECTURE §6.3). Merged into core/env.ts; kept
// apart so that file stays a list of keys. Every key is optional at parse time so `next build`
// runs without secrets; checkWaffoEnv makes them required once PAYMENT_CHANNEL is 'waffo', and
// refuses a partial product map at any time ("九个 id 都要有，缺一个启动时报错").

const blankAsUnset = (value: unknown) => (value === '' ? undefined : value)
const optionalSecret = z.preprocess(blankAsUnset, z.string().min(1).optional())

// A JSON object in one variable; anything that is not JSON fails the record check below.
function parseJson(value: unknown): unknown {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

// An enum-keyed record is exhaustive in zod 4: all nine ids, nothing else.
export const waffoProductIdsSchema = z.record(z.enum(PRODUCT_IDS), z.string().regex(/^PROD_[A-Za-z0-9]+$/))

// The six memberships as Waffo subscription products (T50): a card membership on Waffo is a
// recurring order of one of these. Same rule: all six, nothing else, or start-up fails.
export const MEMBERSHIP_PRODUCT_IDS = [
  'starter_monthly',
  'starter_yearly',
  'pro_monthly',
  'pro_yearly',
  'max_monthly',
  'max_yearly',
] as const satisfies readonly ProductId[]
export type MembershipProductId = (typeof MEMBERSHIP_PRODUCT_IDS)[number]
export const waffoSubscriptionIdsSchema = z.record(z.enum(MEMBERSHIP_PRODUCT_IDS), z.string().regex(/^PROD_[A-Za-z0-9]+$/))

export const waffoEnvShape = {
  // Which channel the paywall uses (§6.3). Default Stripe; switching is a manual env change and
  // a redeploy, never an automatic failover.
  PAYMENT_CHANNEL: z.preprocess(blankAsUnset, z.enum(['stripe', 'waffo']).default('stripe')),
  // Waffo API keys are bound to one environment when created; this names which one so the
  // webhook can refuse events from the other. 'prod' only on the production deployment.
  WAFFO_ENVIRONMENT: z.preprocess(blankAsUnset, z.enum(['test', 'prod']).default('test')),
  WAFFO_MERCHANT_ID: z.preprocess(blankAsUnset, z.string().regex(/^MER_[A-Za-z0-9]+$/).optional()),
  WAFFO_STORE_ID: z.preprocess(blankAsUnset, z.string().regex(/^STO_[A-Za-z0-9]+$/).optional()),
  // RSA private key of the API key (PEM; a one-line paste with literal \n is accepted).
  WAFFO_PRIVATE_KEY: optionalSecret,
  // Waffo's webhook verification public key for this environment (Dashboard → Settings → Webhooks).
  WAFFO_WEBHOOK_PUBLIC_KEY: optionalSecret,
  // {"starter_monthly":"PROD_…", …}: the nine site products to Waffo one-time products.
  WAFFO_PRODUCT_IDS: z.preprocess(blankAsUnset, z.preprocess(parseJson, waffoProductIdsSchema).optional()),
  // {"starter_monthly":"PROD_…", …}: the six memberships to Waffo subscription products, for card
  // checkouts (T50). Alipay and the packs keep using WAFFO_PRODUCT_IDS.
  WAFFO_SUBSCRIPTION_PRODUCT_IDS: z.preprocess(blankAsUnset, z.preprocess(parseJson, waffoSubscriptionIdsSchema).optional()),
}

type WaffoEnv = {
  VERCEL_ENV?: 'production' | 'preview' | 'development'
  PAYMENT_CHANNEL: 'stripe' | 'waffo'
  WAFFO_ENVIRONMENT: 'test' | 'prod'
  WAFFO_MERCHANT_ID?: string
  WAFFO_STORE_ID?: string
  WAFFO_PRIVATE_KEY?: string
  WAFFO_WEBHOOK_PUBLIC_KEY?: string
  WAFFO_PRODUCT_IDS?: unknown
  WAFFO_SUBSCRIPTION_PRODUCT_IDS?: unknown
}

export const WAFFO_REQUIRED_KEYS = [
  'WAFFO_MERCHANT_ID',
  'WAFFO_STORE_ID',
  'WAFFO_PRIVATE_KEY',
  'WAFFO_WEBHOOK_PUBLIC_KEY',
  'WAFFO_PRODUCT_IDS',
  'WAFFO_SUBSCRIPTION_PRODUCT_IDS',
] as const

export function checkWaffoEnv(env: WaffoEnv, ctx: z.RefinementCtx): void {
  // Preview and local stay on the sandbox (AGENTS §8), as with Stripe's live keys.
  if (env.WAFFO_ENVIRONMENT === 'prod' && env.VERCEL_ENV !== 'production') {
    ctx.addIssue({ code: 'custom', path: ['WAFFO_ENVIRONMENT'], message: 'prod only in production' })
  }
  if (env.PAYMENT_CHANNEL !== 'waffo') return
  for (const key of WAFFO_REQUIRED_KEYS) {
    if (env[key] === undefined) ctx.addIssue({ code: 'custom', path: [key], message: 'required when PAYMENT_CHANNEL=waffo' })
  }
}
