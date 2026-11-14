import 'server-only'

import { stripeProductName, type DisputeEvidenceConfig } from '@/core/billing/stripe'
import type { SiteProduct } from '@/core/config'
import { legalPlainText } from '@/core/content'

import { refundPolicyPage, termsPage } from './content/legal'
import { site } from './site.config'

// The site's facts for the dispute evidence draft (T82, core/billing/stripe/disputes): product
// names and credits from site.config, the refund policy word for word from the legal page, and
// the public URLs (always the production domain: that is what the buyer agreed to).
const origin = `https://${site.brand.domain}`
const refundPolicyText = legalPlainText(refundPolicyPage, origin)

export function disputeEvidenceConfig(input: { managedPayments: boolean }, products: readonly SiteProduct[]): DisputeEvidenceConfig {
  return {
    ...input,
    context: (productId, charge) => {
      const product = products.find((p) => p.id === productId) ?? null
      return {
        brand: site.brand.name,
        origin,
        product: product
          ? { name: stripeProductName(product, site.brand.name), credits: product.credits, membership: product.interval }
          : null,
        refundPolicyText,
        termsUrl: `${origin}${termsPage.path}`,
        refundUrl: `${origin}${refundPolicyPage.path}`,
        charge,
      }
    },
  }
}
