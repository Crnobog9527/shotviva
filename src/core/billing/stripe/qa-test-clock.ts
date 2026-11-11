import 'server-only'

import type Stripe from 'stripe'

// Test-site only (Owner 2026-11-11): a QA persona's card subscription checks out as a Stripe
// customer on a test clock, so `pnpm qa:clock advance` can move time past the period end and
// Stripe sends a real `subscription_cycle` invoice. Checkout cannot attach an existing
// customer to a clock and the app never passes one, so renewals were otherwise untestable.
//
// Three independent guards, all required, none configurable:
//   1. VERCEL_ENV is exactly 'preview' (production, development and unset are refused);
//   2. the Stripe key is a test key (sk_test_), and the site is not on the production domain;
//   3. the buyer's email is one of the fixed QA personas below.
// A production deployment therefore can never turn this on, whatever its env vars say.

// Every QA persona (scripts/qa/personas.ts; a test keeps the two lists equal).
export const QA_PERSONA_EMAILS: ReadonlySet<string> = new Set([
  'qa-admin@shotviva.com',
  'qa-creator@shotviva.com',
  'qa-fresh@shotviva.com',
  'qa-max@shotviva.com',
  'qa-free@shotviva.com',
  'qa-invitee@shotviva.com',
])

export type ClockGuardEnv = { VERCEL_ENV?: string; STRIPE_SECRET_KEY?: string }

export function qaTestClockAllowed(env: ClockGuardEnv, origin: string, productionDomain: string, email: string | null): boolean {
  if (env.VERCEL_ENV !== 'preview') return false
  if (!env.STRIPE_SECRET_KEY?.startsWith('sk_test_')) return false
  if (onDomain(origin, productionDomain)) return false
  return email !== null && QA_PERSONA_EMAILS.has(email.trim().toLowerCase())
}

function onDomain(origin: string, domain: string): boolean {
  let host: string
  try {
    host = new URL(origin).hostname.toLowerCase()
  } catch {
    return true // An origin we cannot read is treated as production.
  }
  const apex = domain.toLowerCase()
  return host === apex || host.endsWith('.' + apex)
}

export type ClockStripe = {
  testHelpers: { testClocks: Pick<Stripe['testHelpers']['testClocks'], 'create'> }
  customers: Pick<Stripe['customers'], 'create'>
}

export const QA_CLOCK_PREFIX = 'shotviva-qa'

// One new clock and customer per checkout attempt. The checkout token keys both calls, so a
// retried request reuses the same customer (and the same Checkout Session) instead of a new one.
export async function qaClockCustomer(stripe: ClockStripe, input: { userId: string; email: string; token: string; now?: number }): Promise<string> {
  const frozen = Math.floor((input.now ?? Date.now()) / 1000)
  const clock = await stripe.testHelpers.testClocks.create(
    { frozen_time: frozen, name: `${QA_CLOCK_PREFIX} ${input.email}` },
    { idempotencyKey: `qa-clock:${input.token}` },
  )
  const customer = await stripe.customers.create(
    { email: input.email, test_clock: clock.id, metadata: { user_id: input.userId, qa_test_clock: clock.id } },
    { idempotencyKey: `qa-clock-customer:${input.token}` },
  )
  return customer.id
}
