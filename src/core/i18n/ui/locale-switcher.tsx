'use client'

import { useLocale, useTranslations } from 'next-intl'

import { cn } from '../../ui/cn'
import { rememberLocale } from '../locale-cookie'
import { isLocale } from '../locales'
import { usePathname } from '../navigation'
import { otherLocale, switchHref } from '../switch-target'

type Props = { translatedPaths: readonly string[]; className?: string }

// The same page in the other language keeps its query (Graylum's state and return_to on
// /connect/graylum, `next` on /login). Added at click time: the rendered href stays the clean
// page address for crawlers, and static pages never read search params while rendering.
function keepQuery(link: HTMLAnchorElement): void {
  const { search } = window.location
  const samePage = link.pathname !== '/' && link.pathname !== '/zh'
  if (search && samePage && !link.search) link.search = search
}

// Header / footer language switch (建站规格 §6): a real <a href>, never a JS redirect, so
// crawlers follow it and it works without hydration. The click also stores the choice.
export function LocaleSwitcher({ translatedPaths, className }: Props) {
  const raw = useLocale()
  const locale = isLocale(raw) ? raw : 'en'
  const t = useTranslations('locale.switcher')
  const target = otherLocale(locale)
  return (
    <a
      href={switchHref(usePathname(), locale, translatedPaths)}
      hrefLang={target === 'zh' ? 'zh-Hans' : 'en'}
      lang={target === 'zh' ? 'zh-Hans' : 'en'}
      onClick={(event) => {
        rememberLocale(target)
        keepQuery(event.currentTarget)
      }}
      className={cn('inline-flex min-h-11 items-center underline-offset-4 hover:underline', target === 'zh' && 'font-cjk-system', className)}
    >
      {t(target)}
    </a>
  )
}

// Static fallback while the pathname is request data: the other language's home.
export function LocaleSwitcherFallback({ className }: { className?: string }) {
  const raw = useLocale()
  const target = otherLocale(isLocale(raw) ? raw : 'en')
  const t = useTranslations('locale.switcher')
  return (
    <a
      href={target === 'zh' ? '/zh' : '/'}
      className={cn('inline-flex min-h-11 items-center', target === 'zh' && 'font-cjk-system', className)}
    >
      {t(target)}
    </a>
  )
}
