import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

import { CookieSettingsButton } from '../../analytics/browser'
import type { SiteBrand } from '../../config'
import { Link } from '../../i18n/ui'

export type FooterLink = { href: `/${string}`; label: string }

// Every marketing page: the wordmark, the contact email and the copyright, then the legal links
// and the text language switch (DESIGN §6.9 item 5, 建站规格 G8: the footer carries only the
// contact email and the copyright). The legal links end with Cookie settings (T70). The operating
// entity, address, launch year and countries live on the legal pages and in the Organization
// JSON-LD. The MiSans attribution is on the Terms page (ARCHITECTURE §17).
//
// The bottom row is one left-aligned link run (legal links, then the affiliate program, then
// Cookie settings) with the language switch on the right; once the run no longer fits beside it,
// the switch drops to its own line. Every item carries a leading dot and the run is shifted left
// under a clipping box, so the dot that starts a wrapped line is hidden, and the lines are balanced
// so none is left holding a single link (marketing.css).
type Props = {
  brand: SiteBrand
  links: readonly FooterLink[]
  programLink?: FooterLink
  languageSwitch?: ReactNode
}

export function SiteFooter({ brand, links, languageSwitch, programLink }: Props) {
  const t = useTranslations('footer')
  const run = programLink ? [...links, programLink] : links
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
          <nav className="mk-foot-links" aria-label={t('legalNav')}>
            <div className="mk-foot-run">
              {run.map((link) => (
                <span key={link.href} className="mk-foot-item">
                  <span className="mk-foot-dot" aria-hidden>
                    ·
                  </span>
                  <Link href={link.href}>{link.label}</Link>
                </span>
              ))}
              {/* Reopens the analytics cookie bar (T70). */}
              <span className="mk-foot-item">
                <span className="mk-foot-dot" aria-hidden>
                  ·
                </span>
                <CookieSettingsButton className="mk-foot-btn" />
              </span>
            </div>
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
