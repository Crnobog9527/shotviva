import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { notFound, redirect } from 'next/navigation'

import { createAdminSupabase, createServerSupabase, requireUser } from '@/core/auth'
import { readBalance } from '@/core/billing'
import { PendingReturn, SuccessReturn, partnerParams, readCheckoutFacts, readReturnQuery, returnView } from '@/core/billing/checkout-return'
import { CHECKOUT_RETURN, stripeClient } from '@/core/billing/stripe'
import { localizePath } from '@/core/i18n'
import { currentLocale } from '@/core/i18n/server'
import { pricingReturnTarget } from '@/core/partner'
import { site } from '@/site/site.config'

// Where Stripe and Waffo send the buyer after paying (T43, comps-v3-b checkout.html). Signed in,
// noindex through the app layout, read only: the credits come from the webhook, this page only
// reports whether they are in. Cancel never lands here (/pricing?checkout=cancel).
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('app.checkout'))('metaTitle') }
}

type Search = Record<string, string | string[] | undefined>

export default async function CheckoutReturnPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams
  const here = `/checkout?${new URLSearchParams(params as Record<string, string>).toString()}`
  const user = await requireUser(here)
  const query = readReturnQuery(params)
  const locale = await currentLocale()
  if (!query) redirect(localizePath('/account', locale))
  const facts = await readCheckoutFacts({ stripe: stripeClient(), db: createAdminSupabase() }, user.id, query)
  const product = site.billing.products.find((p) => p.id === facts?.productId)
  if (!facts || !product) notFound()
  if (facts.abandoned) redirect(localizePath(CHECKOUT_RETURN.cancel, locale))
  const view = returnView(facts, product, await readBalance(await createServerSupabase(), user.id))
  if (view.state === 'pending') return <PendingReturn view={view} again={localizePath(here, locale)} email={site.brand.contactEmail} />
  const back = pricingReturnTarget(partnerParams(params), { returnToHosts: site.partners.graylum.returnToHosts })
  return <SuccessReturn view={view} back={back} />
}
