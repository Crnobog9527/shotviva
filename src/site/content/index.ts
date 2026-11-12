import { pageGate, type ContentPage } from '@/core/content'
import { isGateOpen } from '@/core/seo'

import { site } from '../site.config'

import { homePage } from './home'
import { aiRestaurantMenu } from './pages/ai-restaurant-menu'
import { commercialPhotography } from './pages/commercial-photography'
import { imageToImageGenerator } from './pages/image-to-image-generator'

// Registry of inner SEO pages rendered by app/(marketing)/[slug]. Add one file per page
// under pages/ and list it here; the URL must already be in the keyword map CSV (AGENTS §9).
export const contentPages: readonly ContentPage[] = [imageToImageGenerator, commercialPhotography, aiRestaurantMenu]

export function findContentPage(slug: string): ContentPage | undefined {
  return contentPages.find((page) => page.slug === slug)
}

export { homePage }
export { pricingFaq, pricingPage } from './pricing'
export { type CreditFacts } from './offer'
export { featuredSections, featuredTemplates, tryTemplates } from './home-templates'
export { creditFacts, fillCredits } from './credits'
export { offersShownIn } from './shown-offers'

// Module ownership of each page, fed to the indexing switch, sitemap and llms.txt.
export const pageGates = [homePage, ...contentPages].map(pageGate)

export function isLinkEnabled(href: string): boolean {
  return isGateOpen(site, href, pageGates)
}
export { acceptableUsePage, footerLinks, legalPages, privacyPage, refundPolicyPage, termsPage, withWechatPay } from './legal'
export {
  contentPagesIn,
  findContentPageIn,
  freeImagesIn,
  footerLinksIn,
  homePageIn,
  pricingFaqIn,
  pricingPageIn,
} from './localized'
export type { PricingContent } from './pricing'
