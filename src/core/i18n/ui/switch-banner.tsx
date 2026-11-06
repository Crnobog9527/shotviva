'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

import { hasChosenLocale, prefersChinese, rememberLocale } from '../locale-cookie'
import { localizePath, matchesPaths } from '../paths'
import { usePathname } from '../navigation'

// 「切换到中文」(ARCHITECTURE §17): on an English page that has a Chinese version, for a
// visitor whose first browser language is Chinese and who has not chosen yet. Decided in the
// browser after hydration, so pages stay static and nothing redirects. Either button stores
// the choice; it never shows again after that.
export function SwitchBanner({ translatedPaths }: { translatedPaths: readonly string[] }) {
  const locale = useLocale()
  const path = usePathname()
  const t = useTranslations('locale.banner')
  const [visible, setVisible] = useState(false)
  const eligible = locale === 'en' && matchesPaths(path, translatedPaths)

  useEffect(() => {
    // Browser-only facts, read once after hydration; the server render never shows the banner.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVisible(eligible && prefersChinese(navigator.languages ?? []) && !hasChosenLocale(document.cookie))
  }, [eligible])

  if (!visible) return null
  return (
    <div lang="zh-Hans" className="font-cjk-system flex w-full items-center gap-3 bg-muted px-4 py-2 text-sm leading-relaxed text-foreground">
      <p className="min-w-0 flex-1 text-center">
        {t('text')}{' '}
        <a
          href={localizePath(path, 'zh')}
          hrefLang="zh-Hans"
          onClick={(event) => {
            rememberLocale('zh')
            // Keep the query (e.g. `next` on /login) on the way to the Chinese twin.
            if (window.location.search) event.currentTarget.search = window.location.search
          }}
          className="font-semibold whitespace-nowrap underline underline-offset-2"
        >
          {t('switch')}
        </a>
      </p>
      <button
        type="button"
        aria-label={t('dismiss')}
        onClick={() => {
          rememberLocale('en')
          setVisible(false)
        }}
        className="-my-1 -mr-2 flex size-8 shrink-0 items-center justify-center rounded-full opacity-80 hover:opacity-100"
      >
        <span aria-hidden>×</span>
      </button>
    </div>
  )
}
