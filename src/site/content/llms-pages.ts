import type { SiteProduct } from '@/core/config'

import { site } from '../site.config'
import { freeImagesLabel, offerFacts, product, usd } from './offer'
import { pricingPageIn } from './localized'

// The /pricing line of /llms.txt (SEO patch v5 item 5): the three monthly plans in one sentence,
// prices from the published catalog. Undefined while any monthly plan is unpublished.
export function llmsPricingLine(products: readonly SiteProduct[]): { path: string; title: string; description: string } | undefined {
  const monthly = (['starter', 'pro', 'max'] as const).map((tier) => product(`${tier}_monthly`, products))
  if (monthly.some((plan) => plan === undefined)) return undefined
  const [starter, pro, max] = monthly.map((plan) => usd(plan?.priceUsd ?? 0))
  const { packFrom } = offerFacts(products)
  const packs = packFrom ? `; one-time credit packs from ${usd(packFrom.priceUsd)}` : ''
  return {
    path: '/pricing',
    title: pricingPageIn('en', products).title,
    description: `${site.brand.name} plans: Starter ${starter}, Pro ${pro} and Max ${max} a month${packs}. New users get ${freeImagesLabel}.`,
  }
}
