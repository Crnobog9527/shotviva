import type { Metadata } from 'next'

import { PaywallProvider, PricingPlans } from '@/core/billing/paywall'
import { paymentChannel } from '@/core/billing/waffo'
import { Breadcrumbs, FaqSection } from '@/core/content'
import { currentLocale } from '@/core/i18n/server'
import { JsonLdScript, breadcrumbListLd, faqPageLd, pageMetadata } from '@/core/seo'
import { homePage, pricingFaq, pricingPage, pricingPayment, type PricingTable } from '@/site/content'
import { isWishlistEnabled } from '@/core/wishlist'
import { site } from '@/site/site.config'

// Prices render from site.config (plans through core/billing/paywall, tables through
// site/content) into the static HTML. Indexable: /pricing is in the keyword map CSV and in
// site.indexing. Buying opens the same paywall as the app; signed-out buyers sign in first.
// PAYMENT_CHANNEL is read when the page renders (at build): switching channel is an env change
// plus a redeploy, which re-renders this page with the matching payment copy.
export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata(site, pricingPage, await currentLocale())
}

const crumbs = [
  { name: homePage.label, path: '/' },
  { name: 'Pricing', path: pricingPage.path },
]

function PriceTable({ table }: { table: PricingTable }) {
  return (
    <section>
      <h2>{table.caption}</h2>
      <table>
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
    </section>
  )
}

export default function PricingPage() {
  const { tables } = pricingPage
  const wishlistLive = isWishlistEnabled(site)
  const channel = paymentChannel()
  const faq = pricingFaq(channel)
  return (
    <article className="mx-auto flex w-full max-w-5xl flex-col gap-8 py-4">
      <JsonLdScript data={[breadcrumbListLd(site, crumbs), faqPageLd(faq)]} />
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4">
        <Breadcrumbs crumbs={crumbs} />
        <header>
          <h1>{pricingPage.h1}</h1>
          <p>{pricingPage.intro}</p>
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
          <h2>How you pay</h2>
          <ul>
            {pricingPayment(channel).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
        <FaqSection faq={faq} heading="Pricing FAQ" />
      </div>
    </article>
  )
}
