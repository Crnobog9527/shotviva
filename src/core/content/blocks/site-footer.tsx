import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

import type { SiteBrand } from '../../config'
import { Link } from '../../i18n/ui'

export type FooterLink = { href: `/${string}`; label: string }

// Every marketing page carries the official-site statement, contact email, copyright and the
// legal links. The operating entity and address live on the legal pages and in the Organization
// JSON-LD, not here (DESIGN §6.9 item 5, 建站规格 G8; Owner 2026-11-06). Facts come from the config.
// The MiSans attribution is on the Terms page, not here (ARCHITECTURE §17).
type Props = { brand: SiteBrand; links: readonly FooterLink[]; languageSwitch?: ReactNode }

export function SiteFooter({ brand, links, languageSwitch }: Props) {
  const t = useTranslations('footer')
  return (
    <footer className="mt-16 border-t border-border">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-4 py-8 text-sm text-muted-foreground">
        <nav aria-label="Legal">
          <ul className="flex flex-wrap gap-x-6">
            {links.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="inline-flex min-h-11 items-center underline-offset-4 hover:text-foreground hover:underline"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <p>
          {brand.name} — {brand.tagline}. {brand.domain} is the only official {brand.name} site.
        </p>
        <p>
          Launched {brand.launchYear}. Serving {brand.countries.join(', ')}. Contact:{' '}
          <a href={`mailto:${brand.contactEmail}`} className="underline underline-offset-4 hover:text-foreground">
            {brand.contactEmail}
          </a>
        </p>
        <p>
          © {brand.launchYear} {brand.name}
        </p>
        {languageSwitch ? (
          <p>
            <span className="sr-only">{t('language')}</span>
            {languageSwitch}
          </p>
        ) : null}
      </div>
    </footer>
  )
}
