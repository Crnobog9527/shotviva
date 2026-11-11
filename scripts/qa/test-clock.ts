/**
 * pnpm qa:clock list                  QA test clocks, their customers' subscriptions and period ends
 * pnpm qa:clock advance <clock_id>    moves the clock just past the latest period end, so Stripe
 *                                     bills the next period (a real subscription_cycle invoice)
 * pnpm qa:clock delete <clock_id>     deletes the clock with its customer and subscriptions
 *
 * Test mode only: refuses anything but an sk_test_ key, and only touches clocks the test site
 * created for QA personas (name prefix, core/billing/stripe/qa-test-clock.ts).
 */
import Stripe from 'stripe'

import { parseClockArgs, nextFrozenTime, QA_CLOCK_NAME_PREFIX, type ClockArgs } from './test-clock-args'

function client(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY ?? ''
  if (!key.startsWith('sk_test_')) throw new Error('qa:clock runs only with a Stripe test key (sk_test_) in .env.local')
  return new Stripe(key)
}

async function qaClock(stripe: Stripe, id: string) {
  const clock = await stripe.testHelpers.testClocks.retrieve(id)
  if (!clock.name?.startsWith(QA_CLOCK_NAME_PREFIX)) throw new Error(`${id} is not a QA test clock`)
  return clock
}

async function subscriptionsOn(stripe: Stripe, clockId: string) {
  const customers = await stripe.customers.list({ test_clock: clockId, limit: 3 })
  const subs = await Promise.all(customers.data.map((c) => stripe.subscriptions.list({ customer: c.id, status: 'all', limit: 10 })))
  return subs.flatMap((page) => page.data)
}

const iso = (seconds: number) => new Date(seconds * 1000).toISOString()

async function list(stripe: Stripe) {
  for await (const clock of stripe.testHelpers.testClocks.list({ limit: 100 })) {
    if (!clock.name?.startsWith(QA_CLOCK_NAME_PREFIX)) continue
    const subs = await subscriptionsOn(stripe, clock.id)
    const periods = subs.map((s) => `${s.id} ${s.status} until ${iso(s.items.data[0]?.current_period_end ?? 0)}`).join('; ')
    process.stdout.write(`${clock.id}  ${clock.status}  now ${iso(clock.frozen_time)}  ${periods || 'no subscription'}\n`)
  }
}

async function advance(stripe: Stripe, id: string) {
  const clock = await qaClock(stripe, id)
  const ends = (await subscriptionsOn(stripe, id)).map((s) => s.items.data[0]?.current_period_end ?? 0)
  const target = nextFrozenTime(clock.frozen_time, ends)
  await stripe.testHelpers.testClocks.advance(id, { frozen_time: target })
  process.stdout.write(`${id} advancing to ${iso(target)}; Stripe sends the renewal webhooks when it is ready.\n`)
}

async function main(args: ClockArgs) {
  const stripe = client()
  if (args.command === 'list') return list(stripe)
  if (args.command === 'advance') return advance(stripe, args.clock)
  await qaClock(stripe, args.clock)
  await stripe.testHelpers.testClocks.del(args.clock)
  process.stdout.write(`${args.clock} deleted with its customer and subscriptions.\n`)
}

main(parseClockArgs(process.argv.slice(2))).catch((error: unknown) => {
  process.stderr.write(`qa:clock failed: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
})
