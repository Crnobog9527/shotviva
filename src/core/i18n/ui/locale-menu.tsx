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
    <details ref={ref} className={cn('group relative', className)}>
      <summary
        aria-label={t('label')}
        title={t('label')}
        className="grid size-11 cursor-pointer list-none place-items-center [&::-webkit-details-marker]:hidden"
      >
        {/* 36px disc in a 44px hit area; solid bone while the menu is open (v3-b comp). */}
        <span className="grid size-9 place-items-center rounded-full bg-wash text-bone-dim hairline transition-colors duration-200 hover:bg-wash-strong hover:text-foreground group-open:bg-foreground group-open:text-background group-open:shadow-none">
          <Globe aria-hidden className="size-[18px]" strokeWidth={1.8} />
        </span>
      </summary>
      <ul className="absolute top-[calc(100%+4px)] right-0 z-60 min-w-[196px] rounded-control bg-popover p-1.5 shadow-[inset_0_0_0_1px_var(--border),0_24px_48px_-16px_rgba(0,0,0,.7)]">
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
                'flex min-h-11 items-center justify-between gap-3 rounded-[10px] pr-2.5 pl-3 text-[15px] font-medium hover:bg-wash',
                locale === 'zh' && current === 'en' && 'font-cjk-system',
              )}
            >
              {t(locale)}
              <Check aria-hidden strokeWidth={2.4} className={cn('size-4 text-primary', locale !== current && 'invisible')} />
            </a>
          </li>
        ))}
      </ul>
    </details>
  )
}
