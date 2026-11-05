import Link from 'next/link'

import type { HomePage } from '../page-content'

type Props = { grid: HomePage['templateGrid']; isLinkEnabled: (href: string) => boolean }

// One H3 per category; template names and uses are in the HTML source (建站规格 R5, §4 H2-2).
// Real cards with covers come with T8 on top of T3 data.
export function TemplateGrid({ grid, isLinkEnabled }: Props) {
  return (
    <section>
      <h2>{grid.heading}</h2>
      <p>{grid.intro}</p>
      {grid.categories.map((category) => {
        const links = (category.links ?? []).filter((link) => isLinkEnabled(link.href))
        return (
          <section key={category.name}>
            <h3>{category.name}</h3>
            <p>{category.intro}</p>
            <ul>
              {category.templates.map((template) => (
                <li key={template.name}>
                  <strong>{template.name}</strong>: {template.use}
                </li>
              ))}
            </ul>
            {links.length > 0 && (
              <p>
                {links.map((link, i) => (
                  <span key={link.href}>
                    {i > 0 && ' · '}
                    <Link href={link.href}>{link.anchor}</Link>
                  </span>
                ))}
              </p>
            )}
          </section>
        )
      })}
    </section>
  )
}
