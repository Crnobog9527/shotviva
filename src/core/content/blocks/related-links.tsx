import { Link } from '../../i18n/ui'

import type { RelatedLink } from '../page-content'

const arrow = (
  <span className="mk-go" aria-hidden>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 17L17 7M9 7h8v8" />
    </svg>
  </span>
)

// Block ⑤. The caller passes only links to pages that exist (建站规格 R8). 'cards' is the home
// page's version (DESIGN v3-b): one card per link, the note saying who it is for.
export function RelatedLinks({ heading, links, variant = 'list' }: { heading: string; links: readonly RelatedLink[]; variant?: 'list' | 'cards' }) {
  if (variant === 'cards') {
    return (
      <nav className="mk-block mk-reveal" aria-labelledby="more-h">
        <h2 className="mk-h2" id="more-h">
          {heading}
        </h2>
        <ul className="mk-links">
          {links.map((link) => (
            <li key={link.href}>
              <Link href={link.href}>
                <span>
                  <b>{link.anchor}</b>
                  {link.note && <small>{link.note}</small>}
                </span>
                {arrow}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    )
  }
  return (
    <nav aria-label={heading}>
      <h2>{heading}</h2>
      <ul>
        {links.map((link) => (
          <li key={link.href}>
            <Link href={link.href}>{link.anchor}</Link>
            {link.note && <p>{link.note}</p>}
          </li>
        ))}
      </ul>
    </nav>
  )
}
