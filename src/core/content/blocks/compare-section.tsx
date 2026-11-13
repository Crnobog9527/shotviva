import type { LandingParts } from '../page-content'
import { FaqTableView } from './faq-section'

// One comparison table under its own H2 (SEO launch handbook 04-P1: "Transparent PNG vs White
// Background vs Listing Photo"), a real <table> so AI answers can lift it (建站规格 G5). It wears
// the FAQ table's styles (.mk-faq table), so it adds nothing to the public stylesheet.
export function CompareSection({ compare }: { compare: NonNullable<LandingParts['compare']> }) {
  return (
    <section className="mk-block mk-reveal" aria-labelledby="compare-h">
      <h2 className="mk-h2" id="compare-h">
        {compare.heading}
      </h2>
      <p className="mk-intro">{compare.intro}</p>
      <div className="mk-faq">
        <FaqTableView table={compare.table} />
      </div>
    </section>
  )
}
