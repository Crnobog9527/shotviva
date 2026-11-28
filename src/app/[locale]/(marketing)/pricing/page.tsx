import type { Metadata } from 'next'

import { photoPrices } from '@/core/billing'
import { CheckoutCancelToast, PaywallProvider, PricingPlans } from '@/core/billing/paywall'
import { walletOffersWechat } from '@/core/billing/wallet'
import { StandingFetch } from '@/core/billing/paywall/standing-fetch'
import { paymentChannel } from '@/core/billing/waffo'
import { CreditBuys, FaqSection, PricingHero } from '@/core/content'
import { BusinessSection } from '@/core/content/business'
import { localizePath } from '@/core/i18n'
import { currentLocale } from '@/core/i18n/server'
import { JsonLdScript, breadcrumbListLd, faqPageLd, pageMetadata, softwareApplicationLd } from '@/core/seo'
import { cachedWebCatalogue } from '@/core/templates/cached-catalogue'
import { creditFacts, fillCredits, freeImagesIn, homePageIn, pricingFaqIn, pricingPageIn } from '@/site/content'
import { isWishlistEnabled } from '@/core/wishlist'
import { displayProducts } from '@/site/billing/display-products'
import { signupGiftCreditsForSite } from '@/site/billing/signup-gift'
import { site } from '@/site/site.config'

import { inquiryPrefillAction, submitInquiryAction } from './actions'

// /pricing as comps-v3-b pricing.html (T37): hero, the plans and packs (core/billing/paywall,
// prices from the published catalog), "For business", what a credit buys, then the FAQ. Both
// languages match: the hero says prices are in USD, and the payment methods and their renewal
// terms are shown where the method is picked, in the paywall (Owner 2026-11-25: no separate
// "Pay with" block on the English page either).
// Stripe's cancel_url lands here (?checkout=cancel) and shows a toast (T43).
// Everything renders into the static HTML, in US dollars in both languages (建站规格 §6.1, R5).
// Indexable: /pricing and /zh/pricing are in their keyword map CSVs and in site.indexing.
// Buying opens the same paywall as the app; signed-out buyers sign in first. A signed-in member's
// plans (T66: lower ones locked, higher ones Upgrade) are asked for from the browser once it finds
// a session cookie (StandingFetch), so this page is fully static.
// PAYMENT_CHANNEL is read when the page renders (at build): switching channel is an env change
// plus a redeploy, which re-renders this page with the matching payment copy.
export async function generateMetadata(): Promise<Metadata> {
  const locale = await currentLocale()
  const [catalogue, products, gift] = await Promise.all([cachedWebCatalogue(locale), displayProducts(), signupGiftCreditsForSite()])
  const page = fillCredits(pricingPageIn(locale, products), creditFacts(catalogue, gift))
  return pageMetadata(site, page, locale)
}

export default async function PricingPage() {
  const locale = await currentLocale()
  // "from N credits" and the image counts filled from the live catalogue (建站规格 G3, G4); the
  // signup gift from its setting (2008).
  const [catalogue, wishlistLive, products, gift] = await Promise.all([cachedWebCatalogue(locale), isWishlistEnabled(site), displayProducts(), signupGiftCreditsForSite()])
  const credits = creditFacts(catalogue, gift)
  const page = fillCredits(pricingPageIn(locale, products), credits)
  const channel = paymentChannel()
  const wechatPay = walletOffersWechat()
  const faq = fillCredits(pricingFaqIn(locale, channel, wechatPay, page), credits)
  const path = localizePath(page.path, locale)
  const crumbs = [
    { name: homePageIn(locale).label, path: localizePath('/', locale) },
    { name: page.label, path },
  ]
  return (
    <article className="mx-auto w-full max-w-[1120px] px-4 pb-16 md:px-8 lg:px-10">
      {/* The offers this page's server HTML shows (03-S2): the monthly plans and the packs. Yearly
          prices appear only after the Yearly toggle, so they stay out. */}
      <JsonLdScript
        data={[
          breadcrumbListLd(site, crumbs),
          softwareApplicationLd(site, { path, title: page.title, description: page.description }, products.filter((p) => p.interval !== 'year'), fillCredits(freeImagesIn(locale), credits)),
          faqPageLd(faq),
        ]}
      />
      <CheckoutCancelToast />
      <PricingHero text={page} />
      <PaywallProvider products={products} perkFacts={{ wishlistLive, photoPrices: photoPrices(catalogue) }} channel={channel} wechatPay={wechatPay}>
        <PricingPlans products={products} />
        <StandingFetch />
      </PaywallProvider>
      <BusinessSection
        block={page.business}
        page={path === '/zh/pricing' ? '/zh/pricing' : '/pricing'}
        actions={{ submit: submitInquiryAction, prefill: inquiryPrefillAction }}
      />
      <div className="mt-6 md:mt-8">
        <CreditBuys block={page.creditBuys} />
      </div>
      {/* The home page's accordion (gap audit B8); every answer stays in the server HTML. */}
      <div className="mk-pricing-faq">
        <FaqSection faq={faq} heading={page.headings.faq} variant="accordion" />
      </div>
    </article>
  )
}
