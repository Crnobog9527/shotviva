import 'server-only'

import Stripe from 'stripe'

import { serverEnv } from '../../env'
import { AppError } from '../../errors'

// The slice of the Stripe SDK this folder uses. Structural so tests pass a fake that answers
// retrieve/list from fixtures while signatures are still checked by the real SDK.
export type StripeApi = {
  webhooks: Pick<Stripe['webhooks'], 'constructEvent'>
  checkout: { sessions: Pick<Stripe['checkout']['sessions'], 'create' | 'retrieve'> }
  prices: Pick<Stripe['prices'], 'list'>
}

let cached: Stripe | undefined

// Preview and local run on the sandbox only (AGENTS §8): a live key outside production is a
// misconfiguration, refused before it can charge a real card.
export function assertKeyMatchesEnvironment(key: string, vercelEnv: string | undefined): void {
  const live = /^(sk|rk)_live_/.test(key)
  if (live && vercelEnv !== 'production') {
    throw new AppError('INTERNAL', 'A live Stripe key is only allowed in production')
  }
}

export function stripeClient(): Stripe {
  if (cached) return cached
  const env = serverEnv()
  const key = env.STRIPE_SECRET_KEY
  if (!key) throw new AppError('INTERNAL', 'STRIPE_SECRET_KEY is not configured')
  assertKeyMatchesEnvironment(key, env.VERCEL_ENV)
  cached = new Stripe(key, { maxNetworkRetries: 2, timeout: 20_000 })
  return cached
}

export function stripeWebhookSecret(): string {
  const secret = serverEnv().STRIPE_WEBHOOK_SECRET
  if (!secret) throw new AppError('INTERNAL', 'STRIPE_WEBHOOK_SECRET is not configured')
  return secret
}

export function managedPaymentsEnabled(): boolean {
  return serverEnv().STRIPE_MANAGED_PAYMENTS === 'on'
}
