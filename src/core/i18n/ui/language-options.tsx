'use client'

import { Check } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'

import { cn } from '../../ui/cn'
import { rememberLocale } from '../locale-cookie'
import { LOCALES, hreflang, isLocale } from '../locales'
import { usePathname } from '../navigation'
import { hrefIn } from '../switch-target'
import { useTranslatedPaths } from './translated-paths'

// The account page's language sheet (DESIGN §6.9 item 4, comps-v3-b/account.html ?lang=open):
// English / 简体中文 as two rows, the current one ringed and ticked. Each row is a real link to
// this page in that language, and the click stores the choice in NEXT_LOCALE (ARCHITECTURE §17),
// the same preference the globe menu and the footer switch write.
export function LanguageOptions() {
  const raw = useLocale()
  const current = isLocale(raw) ? raw : 'en'
  const native = useTranslations('locale.menu')
  const inCurrent = useTranslations('locale.inCurrent')
  const path = usePathname()
  const translated = useTranslatedPaths()
  return (
    <ul className="mt-6 grid gap-2">
      {LOCALES.map((locale) => {
        const selected = locale === current
        const note = inCurrent(locale)
        return (
          <li key={locale}>
            <a
              href={hrefIn(locale, path, translated)}
              hrefLang={hreflang(locale)}
              aria-current={selected ? 'true' : undefined}
              onClick={() => rememberLocale(locale)}
              className={cn(
                'press flex min-h-14 items-center justify-between gap-3 rounded-control bg-card px-4 text-body',
                selected ? 'shadow-[inset_0_0_0_1.5px_var(--primary)]' : 'shadow-[inset_0_0_0_1px_var(--border)]',
              )}
            >
              <span>
                <span lang={hreflang(locale)} className={cn(locale === 'zh' && current === 'en' && 'font-cjk-system')}>
                  {native(locale)}
                </span>
                {note !== native(locale) ? <small className="ml-2 text-caption text-muted-foreground">{note}</small> : null}
              </span>
              <Check aria-hidden strokeWidth={3} className={cn('size-3.5 text-primary', !selected && 'invisible')} />
            </a>
          </li>
        )
      })}
    </ul>
  )
}
