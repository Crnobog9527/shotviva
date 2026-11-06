import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

import type { SiteBrand } from '../../config'
import { Link } from '../../i18n/ui'

export type FooterLink = { href: `/${string}`; label: string }

// Every marketing page: the wordmark, the contact email and the copyright, then the legal links
// and the text language switch (DESIGN §6.9 item 5, 建站规格 G8: the footer carries only the
// contact email and the copyright). The operating entity, address, launch year and countries
// live on the legal pages and in the Organization JSON-LD. The MiSans attribution is on the
// Terms page (ARCHITECTURE §17).
type Props = {
  brand: SiteBrand
  links: readonly FooterLink[]
  languageSwitch?: ReactNode
}

export function SiteFooter({ brand, links, languageSwitch }: Props) {
  const t = useTranslations('footer')
  return (
    <footer className="mk-footer">
      <div className="mk-w">
        <p className="mk-foot-word" aria-hidden>
          {brand.name}
          <i>.</i>
        </p>
        <div className="mk-foot-main">
          <a className="mk-mail" href={`mailto:${brand.contactEmail}`}>
            {brand.contactEmail}
          </a>
          <span className="mk-copy">{t('copyright', { year: String(brand.launchYear), name: brand.name })}</span>
        </div>
        <div className="mk-foot-fine">
          <nav aria-label={t('legalNav')}>
            {links.map((link, i) => (
              <span key={link.href} className="mk-foot-item">
                {i > 0 ? <span aria-hidden>·</span> : null}
                <Link href={link.href}>{link.label}</Link>
              </span>
            ))}
          </nav>
          {languageSwitch ? (
            <nav className="mk-foot-lang" aria-label={t('language')}>
              {languageSwitch}
            </nav>
          ) : null}
        </div>
      </div>
    </footer>
  )
}
