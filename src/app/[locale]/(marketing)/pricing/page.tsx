import type { Metadata } from 'next'

import { PaywallProvider, PricingPlans } from '@/core/billing/paywall'
import { paymentChannel } from '@/core/billing/waffo'
import { Breadcrumbs, FaqSection } from '@/core/content'
import { localizePath } from '@/core/i18n'
import { currentLocale } from '@/core/i18n/server'
import { JsonLdScript, breadcrumbListLd, faqPageLd, pageMetadata } from '@/core/seo'
import { homePageIn, pricingCopyIn, pricingPageIn, type PricingTable } from '@/site/content'
import { isWishlistEnabled } from '@/core/wishlist'
import { site } from '@/site/site.config'

// Prices render from site.config (plans through core/billing/paywall, tables through
// site/content) into the static HTML, in US dollars in both languages (建站规格 §6.1).
// Indexable: /pricing and /zh/pricing are in their keyword map CSVs and in site.indexing.
// Buying opens the same paywall as the app; signed-out buyers sign in first.
// PAYMENT_CHANNEL is read when the page renders (at build): switching channel is an env change
// plus a redeploy, which re-renders this page with the matching payment copy.
export async function generateMetadata(): Promise<Metadata> {
  const locale = await currentLocale()
  return pageMetadata(site, pricingPageIn(locale), locale)
}

function PriceTable({ table }: { table: PricingTable }) {
  return (
    <section>
      <h2>{table.caption}</h2>
      {/* Six columns do not fit 375px in either language: the table scrolls, cells never touch. */}
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm [&_td]:px-2 [&_td]:py-1 [&_th]:px-2 [&_th]:py-1 [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap">
          <thead>
            <tr>
              {table.headers.map((header) => (
                <th key={header} scope="col">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map(([name, ...cells]) => (
              <tr key={name}>
                <th scope="row">{name}</th>
                {cells.map((cell, i) => (
                  <td key={table.headers[i + 1]}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export default async function PricingPage() {
  const locale = await currentLocale()
  const page = pricingPageIn(locale)
  const { tables } = page
  const wishlistLive = isWishlistEnabled(site)
  const channel = paymentChannel()
  const { payment, faq } = pricingCopyIn(locale, channel)
  const crumbs = [
    { name: homePageIn(locale).label, path: '/' },
    { name: page.label, path: page.path },
  ]
  const ldCrumbs = crumbs.map((crumb) => ({ ...crumb, path: localizePath(crumb.path, locale) }))
  return (
    <article className="mx-auto flex w-full max-w-5xl flex-col gap-8 py-4">
      <JsonLdScript data={[breadcrumbListLd(site, ldCrumbs), faqPageLd(faq)]} />
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4">
        <Breadcrumbs crumbs={crumbs} />
        <header>
          <h1>{page.h1}</h1>
          <p>{page.intro}</p>
        </header>
      </div>
      <PaywallProvider products={site.billing.products} wishlistLive={wishlistLive} channel={channel}>
        <PricingPlans products={site.billing.products} wishlistLive={wishlistLive} />
      </PaywallProvider>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4">
        <PriceTable table={tables.plans} />
        <PriceTable table={tables.packs} />
        <PriceTable table={tables.photoCost} />
        <section>
          <h2>{page.headings.payment}</h2>
          <ul>
            {payment.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
        <FaqSection faq={faq} heading={page.headings.faq} />
      </div>
    </article>
  )
}
