'use client'

import { Check, Globe } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'

import { cn } from '../../ui/cn'
import { rememberLocale } from '../locale-cookie'
import { LOCALES, hreflang, isLocale, type Locale } from '../locales'
import { hrefIn } from '../switch-target'
import { usePathname } from '../navigation'
import { keepQuery } from './keep-query'
import { LanguageHintBubble, useLanguageHint } from './language-hint'

type Props = { translatedPaths: readonly string[]; className?: string }

// Open state of the menu (design/comps-v3-b js/marketing.js langMenu()): a click outside closes
// it; opening moves focus to the checked item.
function useMenu() {
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (event: PointerEvent) => {
      if (!wrap.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    wrap.current?.querySelector<HTMLElement>('[role="menuitemradio"][aria-checked="true"]')?.focus()
    return () => document.removeEventListener('pointerdown', close)
  }, [open])
  return { open, setOpen, wrap }
}

// Where a key moves focus among `count` items from `at` (-1: none focused): ↑ ↓ wrap, Home /
// End jump; null for any other key.
export function menuTarget(key: string, at: number, count: number): number | null {
  if (count === 0) return null
  if (key === 'Home') return 0
  if (key === 'End') return count - 1
  if (key !== 'ArrowDown' && key !== 'ArrowUp') return null
  if (at < 0) return 0
  return (at + (key === 'ArrowDown' ? 1 : -1) + count) % count
}

// Arrow keys move between the items, Escape closes and returns focus to the globe.
function onMenuKeys(event: KeyboardEvent<HTMLDivElement>, close: () => void) {
  if (event.key === 'Escape') {
    close()
    event.currentTarget.querySelector<HTMLElement>('[aria-haspopup="menu"]')?.focus()
    return
  }
  const items = [...event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitemradio"]')]
  const next = menuTarget(event.key, items.indexOf(document.activeElement as HTMLElement), items.length)
  if (next === null) return
  event.preventDefault()
  items[next]?.focus()
}

// The marketing top-nav language switch (DESIGN §6.9 item 4): an icon-only globe button that
// opens a menu of 「English」「简体中文」 with the current one checked (menu button pattern:
// aria-haspopup / aria-expanded, menuitemradio items, arrow keys). It stays in the top bar on
// phones; the footer keeps plain links for anyone without JavaScript. For a Chinese-reading
// visitor who has not chosen yet, the globe pulses and offers 「切换到中文？」 (language-hint).
export function LocaleMenu({ translatedPaths, className }: Props) {
  const raw = useLocale()
  const current: Locale = isLocale(raw) ? raw : 'en'
  const t = useTranslations('locale.menu')
  const path = usePathname()
  const { open, setOpen, wrap } = useMenu()
  const menuId = useId()
  const hint = useLanguageHint(translatedPaths)
  const hinting = hint.on && !open
  return (
    <div
      ref={wrap}
      data-hint={hinting ? '' : undefined}
      className={cn('relative', className)}
      onKeyDown={(event) => onMenuKeys(event, () => setOpen(false))}
    >
      <button
        type="button"
        aria-label={t('label')}
        title={t('label')}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen(!open)}
        className="group grid size-11 cursor-pointer place-items-center"
      >
        {/* 36px disc in a 44px hit area; solid bone while the menu is open (v3-b comp). */}
        <span className="lh-disc grid size-9 place-items-center rounded-full bg-wash text-bone-dim hairline transition-colors duration-200 group-hover:bg-wash-strong group-hover:text-foreground group-aria-expanded:bg-foreground group-aria-expanded:text-background group-aria-expanded:shadow-none">
          <Globe aria-hidden className="size-[18px]" strokeWidth={1.8} />
        </span>
      </button>
      {hinting ? <LanguageHintBubble href={hrefIn('zh', path, translatedPaths)} onDismiss={hint.dismiss} /> : null}
      <ul
        id={menuId}
        role="menu"
        aria-label={t('label')}
        hidden={!open}
        className="absolute top-[calc(100%+4px)] right-0 z-60 min-w-[196px] rounded-control bg-popover p-1.5 shadow-[inset_0_0_0_1px_var(--border),0_24px_48px_-16px_rgba(0,0,0,.7)]"
      >
        {LOCALES.map((locale) => (
          <li key={locale} role="none">
            <a
              role="menuitemradio"
              aria-checked={locale === current}
              tabIndex={-1}
              href={hrefIn(locale, path, translatedPaths)}
              hrefLang={hreflang(locale)}
              lang={hreflang(locale)}
              onClick={(event) => {
                rememberLocale(locale)
                keepQuery(event.currentTarget)
              }}
              className={cn(
                'flex min-h-11 items-center justify-between gap-3 rounded-[10px] pr-2.5 pl-3 text-[15px] font-medium outline-none hover:bg-wash focus-visible:bg-wash',
                locale === 'zh' && current === 'en' && 'font-cjk-system',
              )}
            >
              {t(locale)}
              <Check aria-hidden strokeWidth={2.4} className={cn('size-4 text-primary', locale !== current && 'invisible')} />
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}
