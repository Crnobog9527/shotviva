import type { ReactNode } from 'react'

import { Link } from '../../i18n/ui'
import type { PublicRequest } from '../../wishlist'
import { votesLabel, type TemplateRequestsText } from './page-text'

const card = 'rounded-tile bg-card p-4 shadow-[inset_0_0_0_1px_var(--input)] md:p-5'
const badge = 'inline-flex items-center rounded-full bg-wash-strong px-2.5 py-0.5 text-caption leading-[1.4] font-medium'

// H2-2: the most-voted live requests, text only (no photos, no names). Voting happens on the
// signed-in wall, which the section's button opens. An empty wall says so and keeps the button.
export function WantedList({ text, items, voteCta }: { text: TemplateRequestsText['wanted']; items: readonly PublicRequest[]; voteCta: ReactNode }) {
  return (
    <section className="mk-block mk-reveal" aria-labelledby="wanted-h">
      <h2 className="mk-h2" id="wanted-h">
        {text.heading}
      </h2>
      <p className="mk-intro">{text.intro}</p>
      {items.length === 0 ? (
        <p className="mt-4 text-body text-bone-dim">{text.empty}</p>
      ) : (
        <ol className="mt-5 grid gap-3 md:grid-cols-2 md:gap-4">
          {items.map((item) => (
            <li key={item.id} className={card}>
              <p className="flex flex-wrap items-center gap-2">
                <span className={badge}>{text.voting}</span>
                <span className="text-caption text-bone-dim">{votesLabel(text.votes, item.votesCount)}</span>
              </p>
              <p className="mt-2 text-body leading-[1.45] text-pretty break-words">{item.description}</p>
            </li>
          ))}
        </ol>
      )}
      {voteCta ? <div className="mt-5">{voteCta}</div> : null}
    </section>
  )
}

// H2-3: templates already built from requests, each linking to the template's public page. No
// shipped request yet: no section (never faked).
export function ShippedList({ text, items }: { text: TemplateRequestsText['shipped']; items: readonly PublicRequest[] }) {
  if (items.length === 0) return null
  return (
    <section className="mk-block mk-reveal" aria-labelledby="shipped-h">
      <h2 className="mk-h2" id="shipped-h">
        {text.heading}
      </h2>
      <p className="mk-intro">{text.intro}</p>
      <ul className="mt-5 grid gap-3 md:grid-cols-2 md:gap-4">
        {items.flatMap((item) =>
          item.template
            ? [
                <li key={item.id} className={card}>
                  <p className="flex flex-wrap items-center gap-2">
                    <span className={`${badge} text-primary`}>{text.badge}</span>
                    <b className="text-body font-semibold">{item.template.name}</b>
                  </p>
                  <p className="mt-2 text-body leading-[1.45] text-pretty break-words text-bone-dim">{item.description}</p>
                  <Link href={`/t/${item.template.id}`} prefetch={false} className="mt-3 inline-block text-body font-medium text-primary underline-offset-4 hover:underline">
                    {text.open}
                  </Link>
                </li>,
              ]
            : [],
        )}
      </ul>
    </section>
  )
}
