import 'server-only'

import { stripeClient } from '@/core/billing/stripe'
import { qaClockCustomer, qaTestClockAllowed } from '@/core/billing/stripe/qa-test-clock'
import { serverEnv } from '@/core/env'
import { appOrigin } from '@/core/site-url'
import { site } from '@/site/site.config'

// The test-clock customer hook for this buyer, or undefined (production, live key, the
// production domain, or anyone who is not a QA persona). See core/billing/stripe/qa-test-clock.
export function qaCustomerFor(user: { id: string; email: string | null }) {
  const email = user.email
  if (!email || !qaTestClockAllowed(serverEnv(), appOrigin, site.brand.domain, email)) return undefined
  return (token: string) => qaClockCustomer(stripeClient(), { userId: user.id, email, token })
}
