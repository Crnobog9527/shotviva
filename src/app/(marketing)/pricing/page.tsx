import type { Metadata } from 'next'

import { Breadcrumbs, FaqSection } from '@/core/content'
import { JsonLdScript, breadcrumbListLd, faqPageLd, pageMetadata } from '@/core/seo'
import { homePage, pricingPage, type PricingTable } from '@/site/content'
import { site } from '@/site/site.config'

// Prices render from site.config through site/content; the paywall and checkout are T9.
// Not in the keyword map CSV yet, so the indexing switch keeps it noindex.
export const metadata: Metadata = pageMetadata(site, pricingPage)

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
  return (
    <article className="mx-auto flex w-full max-w-3xl flex-col gap-8 p-4">
      <JsonLdScript data={[breadcrumbListLd(site, crumbs), faqPageLd(pricingPage.faq)]} />
      <Breadcrumbs crumbs={crumbs} />
      <header>
        <h1>{pricingPage.h1}</h1>
        <p>{pricingPage.intro}</p>
      </header>
      <PriceTable table={tables.plans} />
      <PriceTable table={tables.packs} />
      <PriceTable table={tables.photoCost} />
      <section>
        <h2>How you pay</h2>
        <ul>
          {pricingPage.payment.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </section>
      <FaqSection faq={pricingPage.faq} heading="Pricing FAQ" />
    </article>
  )
}
