import type { Metadata } from 'next'

import { CheckoutCancelToast } from '@/core/billing/checkout-return'
import { PaywallProvider, PricingPayWith, PricingPlans } from '@/core/billing/paywall'
import { paymentChannel } from '@/core/billing/waffo'
import { BusinessSection, CreditBuys, FaqSection, PricingHero } from '@/core/content'
import { localizePath } from '@/core/i18n'
import { currentLocale } from '@/core/i18n/server'
import { JsonLdScript, breadcrumbListLd, faqPageLd, pageMetadata } from '@/core/seo'
import { BUSINESS_MAIL_SUBJECT, homePageIn, pricingFaqIn, pricingPageIn } from '@/site/content'
import { isWishlistEnabled } from '@/core/wishlist'
import { site } from '@/site/site.config'

// /pricing as comps-v3-b pricing.html (T37): hero, the plans and packs (core/billing/paywall,
// prices from site.config), "For business", what a credit buys, how to pay, then the FAQ.
// Stripe's cancel_url lands here (?checkout=cancel) and shows a toast (T43).
// Everything renders into the static HTML, in US dollars in both languages (建站规格 §6.1, R5).
// Indexable: /pricing and /zh/pricing are in their keyword map CSVs and in site.indexing.
// Buying opens the same paywall as the app; signed-out buyers sign in first.
// PAYMENT_CHANNEL is read when the page renders (at build): switching channel is an env change
// plus a redeploy, which re-renders this page with the matching payment copy.
export async function generateMetadata(): Promise<Metadata> {
  const locale = await currentLocale()
  return pageMetadata(site, pricingPageIn(locale), locale)
}

const faqStyle =
  'mt-12 max-w-3xl [&_h2]:font-display [&_h2]:text-h1 [&_h2]:leading-none [&_h3]:mt-6 [&_h3]:text-headline [&_h3]:font-semibold [&_p]:mt-2 [&_p]:text-bone-dim [&_table]:mt-3 [&_table]:text-caption'

export default async function PricingPage() {
  const locale = await currentLocale()
  const page = pricingPageIn(locale)
  const wishlistLive = isWishlistEnabled(site)
  const channel = paymentChannel()
  const faq = pricingFaqIn(locale, channel)
  const path = localizePath(page.path, locale)
  const crumbs = [
    { name: homePageIn(locale).label, path: localizePath('/', locale) },
    { name: page.label, path },
  ]
  return (
    <article className="mx-auto w-full max-w-[1120px] px-4 pb-16 md:px-8 lg:px-10">
      <JsonLdScript data={[breadcrumbListLd(site, crumbs), faqPageLd(faq)]} />
      <CheckoutCancelToast />
      <PricingHero text={page} />
      <PaywallProvider products={site.billing.products} wishlistLive={wishlistLive} channel={channel}>
        <PricingPlans products={site.billing.products} wishlistLive={wishlistLive} />
      </PaywallProvider>
      <BusinessSection
        block={page.business}
        email={site.brand.contactEmail}
        subject={BUSINESS_MAIL_SUBJECT}
        page={path === '/zh/pricing' ? '/zh/pricing' : '/pricing'}
      />
      <div className="mt-6 grid gap-6 md:mt-8 md:grid-cols-2 md:items-start md:gap-8">
        <CreditBuys block={page.creditBuys} />
        <PricingPayWith channel={channel} />
      </div>
      <div className={faqStyle}>
        <FaqSection faq={faq} heading={page.headings.faq} />
      </div>
    </article>
  )
}
