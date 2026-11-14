'use client'

import { X } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

import { hasChosenLocale, prefersChinese, rememberLocale } from '../locale-cookie'
import { matchesPaths } from '../paths'
import { usePathname } from '../navigation'
import { keepQuery } from './keep-query'
import './language-hint.css'

export type HintInput = {
  locale: string
  path: string
  translatedPaths: readonly string[]
  languages: readonly string[]
  cookie: string
}

// ARCHITECTURE §17 「提醒」: an English page that has a Chinese twin, a browser that lists Chinese
// anywhere in its languages, and no choice yet (either language). It shows on every visit until
// the visitor chooses: 「切换」, the close, or a pick in the globe menu.
export function shouldHint({ locale, path, translatedPaths, languages, cookie }: HintInput): boolean {
  return locale === 'en' && matchesPaths(path, translatedPaths) && prefersChinese(languages) && !hasChosenLocale(cookie)
}

// Browser-only facts, read once after hydration: the server render never shows the hint, so the
// marketing pages stay static.
export function useLanguageHint(translatedPaths: readonly string[]) {
  const locale = useLocale()
  const path = usePathname()
  const [on, setOn] = useState(false)
  useEffect(() => {
    const languages = navigator.languages?.length ? navigator.languages : [navigator.language]
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOn(shouldHint({ locale, path, translatedPaths, languages, cookie: document.cookie }))
  }, [locale, path, translatedPaths])
  return {
    on,
    dismiss() {
      rememberLocale('en')
      setOn(false)
    },
  }
}

// The bubble under the globe (DESIGN §6.9 item 4). Written in Chinese on the English page, since
// it speaks to a Chinese reader; a polite status, so a screen reader hears it without the focus
// moving. 「切换」 is a real link to the Chinese twin that stores the choice first.
export function LanguageHintBubble({ href, onDismiss }: { href: string; onDismiss: () => void }) {
  const t = useTranslations('locale.hint')
  return (
    <div role="status" lang="zh-Hans" className="lh-bubble font-cjk-system">
      <span>{t('text')}</span>
      <a
        href={href}
        hrefLang="zh-Hans"
        className="lh-switch"
        onClick={(event) => {
          rememberLocale('zh')
          keepQuery(event.currentTarget)
        }}
      >
        {t('switch')}
      </a>
      <button type="button" aria-label={t('dismiss')} title={t('dismiss')} className="lh-close" onClick={onDismiss}>
        <X aria-hidden className="size-4" strokeWidth={2.2} />
      </button>
    </div>
  )
}
