'use client'

import { Check, Globe } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useRef } from 'react'

import { cn } from '../../ui/cn'
import { rememberLocale } from '../locale-cookie'
import { LOCALES, hreflang, isLocale, type Locale } from '../locales'
import { hrefIn } from '../switch-target'
import { usePathname } from '../navigation'
import { keepQuery } from './keep-query'

type Props = { translatedPaths: readonly string[]; className?: string }

// Closes the menu on a click outside or on Escape. Without JavaScript it still opens and its
// links still work: it is a <details> with real <a href> items.
function useCloseOnOutside() {
  const ref = useRef<HTMLDetailsElement>(null)
  useEffect(() => {
    const close = (event: Event) => {
      const menu = ref.current
      if (!menu?.open) return
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !menu.contains(event.target as Node)) menu.open = false
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', close)
    }
  }, [])
  return ref
}

// The marketing top-nav language switch (DESIGN §6.9 item 4): an icon-only globe button that
// opens 「English」「简体中文」 with the current one checked. It stays in the top bar on phones.
export function LocaleMenu({ translatedPaths, className }: Props) {
  const raw = useLocale()
  const current: Locale = isLocale(raw) ? raw : 'en'
  const t = useTranslations('locale.menu')
  const path = usePathname()
  const ref = useCloseOnOutside()
  return (
    <details ref={ref} className={cn('relative', className)}>
      <summary
        aria-label={t('label')}
        title={t('label')}
        className="flex size-11 cursor-pointer list-none items-center justify-center rounded-full hover:bg-wash [&::-webkit-details-marker]:hidden"
      >
        <Globe aria-hidden className="size-5" />
      </summary>
      <ul className="absolute right-0 z-50 mt-1 min-w-40 rounded-control bg-card p-1 shadow-lg hairline">
        {LOCALES.map((locale) => (
          <li key={locale}>
            <a
              href={hrefIn(locale, path, translatedPaths)}
              hrefLang={hreflang(locale)}
              lang={hreflang(locale)}
              aria-current={locale === current ? 'true' : undefined}
              onClick={(event) => {
                rememberLocale(locale)
                keepQuery(event.currentTarget)
              }}
              className={cn(
                'flex min-h-11 items-center gap-2 rounded-button px-3 text-body hover:bg-wash',
                locale === 'zh' && current === 'en' && 'font-cjk-system',
              )}
            >
              <Check aria-hidden className={cn('size-4', locale !== current && 'invisible')} />
              {t(locale)}
            </a>
          </li>
        ))}
      </ul>
    </details>
  )
}
