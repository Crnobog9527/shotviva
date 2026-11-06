'use client'

import { X } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

import { hasChosenLocale, prefersChinese, rememberLocale } from '../locale-cookie'
import { localizePath, matchesPaths } from '../paths'
import { usePathname } from '../navigation'

// 「切换到中文」(ARCHITECTURE §17): on an English page that has a Chinese version, for a
// visitor whose first browser language is Chinese and who has not chosen yet. Decided in the
// browser after hydration, so pages stay static and nothing redirects. Either button stores
// the choice; it never shows again after that. `site` (the 404 pages, gap audit B13): the
// address has no page in any language, so the bar offers the Chinese home instead.
export function SwitchBanner({ translatedPaths, site = false }: { translatedPaths: readonly string[]; site?: boolean }) {
  const locale = useLocale()
  const path = usePathname()
  const t = useTranslations('locale.banner')
  const [visible, setVisible] = useState(false)
  const eligible = locale === 'en' && (site || matchesPaths(path, translatedPaths))
  const target = site ? '/' : path

  useEffect(() => {
    // Browser-only facts, read once after hydration; the server render never shows the banner.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVisible(eligible && prefersChinese(navigator.languages ?? []) && !hasChosenLocale(document.cookie))
  }, [eligible])

  if (!visible) return null
  // The comp's .lang-bar (comps-v3-b css/marketing.css): 44px, bone 6% with a hairline under it,
  // and a round 36px × whose hit area is 44px. Copy and the one-year choice cookie stay ours.
  return (
    <div
      role="status"
      lang="zh-Hans"
      className="font-cjk-system flex min-h-11 w-full items-center justify-center gap-3 bg-wash px-4 py-2 text-[14px] leading-[1.3] text-bone-dim shadow-[inset_0_-1px_0_var(--border)]"
    >
      <span className="min-w-0">{site ? t('textSite') : t('text')}</span>
      <a
        href={localizePath(target, 'zh')}
        hrefLang="zh-Hans"
        onClick={(event) => {
          rememberLocale('zh')
          // Keep the query (e.g. `next` on /login) on the way to the Chinese twin.
          if (window.location.search) event.currentTarget.search = window.location.search
        }}
        className="-my-2.5 py-2.5 font-medium whitespace-nowrap text-foreground underline underline-offset-[3px]"
      >
        {t('switch')}
      </a>
      <button
        type="button"
        aria-label={t('dismiss')}
        onClick={() => {
          rememberLocale('en')
          setVisible(false)
        }}
        className="relative -my-1 -mr-2 ml-1 grid size-9 shrink-0 cursor-pointer place-items-center rounded-full text-muted-foreground transition-colors before:absolute before:-inset-1 before:content-[''] hover:bg-wash-strong hover:text-foreground"
      >
        <X aria-hidden className="size-4" strokeWidth={2.2} />
      </button>
    </div>
  )
}
