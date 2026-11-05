import Link from 'next/link'

import type { RelatedLink } from '../page-content'

export function RelatedLinks({ heading, links }: { heading: string; links: readonly RelatedLink[] }) {
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
