import type { Metadata } from 'next'

import { formatProductPrice } from '@/core/config'
import { Breadcrumbs, FaqSection } from '@/core/content'
import { JsonLdScript, breadcrumbListLd, faqPageLd, pageMetadata } from '@/core/seo'
import { homePage, pricingPage } from '@/site/content'
import { site } from '@/site/site.config'

// Placeholder: prices render from site.config; the paywall and checkout are T9.
// Not in the keyword map CSV yet, so the indexing switch keeps it noindex.
export const metadata: Metadata = pageMetadata(site, pricingPage)

const crumbs = [
  { name: homePage.label, path: '/' },
  { name: 'Pricing', path: pricingPage.path },
]

export default function PricingPage() {
  return (
    <article className="mx-auto flex w-full max-w-3xl flex-col gap-8 p-4">
      <JsonLdScript data={[breadcrumbListLd(site, crumbs), faqPageLd(pricingPage.faq)]} />
      <Breadcrumbs crumbs={crumbs} />
      <h1>{pricingPage.h1}</h1>
      <p>{pricingPage.intro}</p>
      <table>
        <thead>
          <tr>
            <th scope="col">Option</th>
            <th scope="col">Images</th>
            <th scope="col">Paid access</th>
            <th scope="col">Price</th>
          </tr>
        </thead>
        <tbody>
          {site.billing.products.map((product) => (
            <tr key={product.id}>
              <th scope="row">{product.id}</th>
              <td>{product.credits}</td>
              <td>{product.paidDays} days</td>
              <td>{formatProductPrice(product)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <FaqSection faq={pricingPage.faq} />
    </article>
  )
}
