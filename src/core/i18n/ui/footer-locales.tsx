'use client'

import { useLocale, useTranslations } from 'next-intl'

import { cn } from '../../ui/cn'
import { rememberLocale } from '../locale-cookie'
import { hreflang, isLocale, type Locale } from '../locales'
import { usePathname } from '../navigation'
import { otherLocale, switchHref } from '../switch-target'
import { keepQuery } from './keep-query'

type Props = { translatedPaths: readonly string[] }

// The footer's quiet text switch (DESIGN §6.9 item 4–5): "English · 简体中文", the current one
// plain, the other a real <a href> so it works before hydration and crawlers follow it.
export function FooterLocales({ translatedPaths }: Props) {
  return <Links href={switchHref(usePathname(), useCurrent(), translatedPaths)} />
}

// Static fallback while the pathname is request data: the other language's home.
export function FooterLocalesFallback() {
  const target = otherLocale(useCurrent())
  return <Links href={target === 'zh' ? '/zh' : '/'} />
}

function useCurrent(): Locale {
  const raw = useLocale()
  return isLocale(raw) ? raw : 'en'
}

function Links({ href }: { href: string }) {
  const current = useCurrent()
  const target = otherLocale(current)
  const t = useTranslations('locale.menu')
  return (
    <>
      <span aria-current="true">{t(current)}</span>
      <span aria-hidden>·</span>
      <a
        href={href}
        hrefLang={hreflang(target)}
        lang={hreflang(target)}
        onClick={(event) => {
          rememberLocale(target)
          keepQuery(event.currentTarget)
        }}
        // Chinese on an English page uses the system CJK fonts, never a MiSans download.
        className={cn(target === 'zh' && 'font-cjk-system')}
      >
        {t(target)}
      </a>
    </>
  )
}
