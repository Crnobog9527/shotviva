import { Link } from '../../i18n/ui'
import type { PlanStrip } from '../page-content'

// The three monthly plans under the two bills: one ruled strip, quieter than the bills above
// it, every cell a link to the pricing page (SEO launch handbook G10). No heading of its own.
export function PlanStripView({ plans }: { plans: PlanStrip }) {
  return (
    <div className="mk-plans">
      <ul aria-label={plans.label}>
        {plans.cards.map((card) => (
          <li key={card.name}>
            <Link href={plans.href}>
              <b>{card.name}</b>
              <span className="mk-plan-price">
                {card.price}
                <small>{card.per}</small>
              </span>
              <span>{card.credits}</span>
              <span>{card.concurrency}</span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="mk-plans-more">
        <Link href={plans.href}>{plans.more}</Link>
      </p>
    </div>
  )
}
