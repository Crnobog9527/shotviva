'use client'

import { useTranslations } from 'next-intl'
import { useRef, type KeyboardEvent } from 'react'

import { cn } from '../../ui/cn'
import type { HelpTab } from './help-param'

const TABS: readonly HelpTab[] = ['new', 'list']

type Props = { current: HelpTab; onChange(tab: HelpTab): void; idBase: string }

export const tabId = (idBase: string, tab: HelpTab) => `${idBase}-tab-${tab}`
export const panelId = (idBase: string, tab: HelpTab) => `${idBase}-panel-${tab}`

// New ticket / My tickets: the paywall's segmented control (billing-toggle) as WAI-ARIA tabs,
// arrows and Home / End move between them. It stays put while the panel scrolls under it.
export function HelpTabs({ current, onChange, idBase }: Props) {
  const t = useTranslations('app.support')
  const buttons = useRef<Partial<Record<HelpTab, HTMLButtonElement | null>>>({})
  function onKeyDown(event: KeyboardEvent) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const target = event.key === 'Home' ? 'new' : event.key === 'End' ? 'list' : current === 'new' ? 'list' : 'new'
    onChange(target)
    buttons.current[target]?.focus()
  }
  return (
    <div className="sticky top-0 z-10 -mx-4 bg-popover px-4 pt-4 pb-1 md:-mx-6 md:px-6">
      <div role="tablist" aria-label={t('title')} onKeyDown={onKeyDown} className="relative grid grid-cols-2 rounded-control bg-wash p-1 shadow-[inset_0_0_0_1px_var(--border)]">
        <span
          aria-hidden="true"
          className={cn(
            'absolute inset-y-1 w-[calc(50%-4px)] rounded-inner bg-foreground transition-[left] duration-400 ease-[var(--spring)] motion-reduce:transition-none',
            current === 'new' ? 'left-1' : 'left-1/2',
          )}
        />
        {TABS.map((tab) => {
          const selected = current === tab
          return (
            <button
              key={tab}
              ref={(node) => {
                buttons.current[tab] = node
              }}
              type="button"
              role="tab"
              id={tabId(idBase, tab)}
              aria-selected={selected}
              aria-controls={panelId(idBase, tab)}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(tab)}
              className={cn(
                'relative z-[1] inline-flex min-h-11 items-center justify-center rounded-inner px-2 text-label font-semibold transition-colors md:text-body',
                selected ? 'text-background' : 'text-bone-dim hover:text-foreground',
              )}
            >
              {t(tab === 'new' ? 'tabs.new' : 'tabs.mine')}
            </button>
          )
        })}
      </div>
    </div>
  )
}
