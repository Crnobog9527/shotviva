import type { CostTable, HomePage } from '../page-content'
import { CostTableView } from './cost-table-section'

// H2-1: "How ... Works in 3 Steps", one H3 per step (建站规格 §4).
export function StepsSection({ steps }: { steps: HomePage['steps'] }) {
  return (
    <section>
      <h2>{steps.heading}</h2>
      <ol>
        {steps.items.map((step) => (
          <li key={step.heading}>
            <h3>{step.heading}</h3>
            <p>{step.text}</p>
          </li>
        ))}
      </ol>
    </section>
  )
}

// H2-4: free credits, free vs paid works, then plans and the cost table (建站规格 §4).
export function FreeOfferSection({ offer, costTable }: { offer: HomePage['freeOffer']; costTable: CostTable }) {
  return (
    <section>
      <h2>{offer.heading}</h2>
      {offer.points.map((point) => (
        <div key={point.heading}>
          <h3>{point.heading}</h3>
          <p>{point.text}</p>
        </div>
      ))}
      <h3>{offer.plans.heading}</h3>
      <p>{offer.plans.text}</p>
      <CostTableView table={costTable} />
    </section>
  )
}
