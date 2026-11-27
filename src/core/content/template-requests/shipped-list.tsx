import { Link } from '../../i18n/ui'
import type { ShippedTemplate } from '../../wishlist'
import type { TemplateRequestsText } from './page-text'

// H2-3: templates built from requests, by name, each linking to its public page. Never the request
// text or who asked (Owner 2026-11-25). None shipped yet: no section (never faked).
export function ShippedList({ text, items }: { text: TemplateRequestsText['shipped']; items: readonly ShippedTemplate[] }) {
  if (items.length === 0) return null
  return (
    <section className="mk-block mk-reveal" aria-labelledby="shipped-h">
      <h2 className="mk-h2" id="shipped-h">
        {text.heading}
      </h2>
      <p className="mk-intro">{text.intro}</p>
      <ul className="mk-links">
        {items.map((item) => (
          <li key={item.id}>
            <Link href={`/t/${item.id}`} prefetch={false}>
              <span>
                <b>{item.name}</b>
                <small>{text.open}</small>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
