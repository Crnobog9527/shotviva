'use client'

import { useTranslations } from 'next-intl'
import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'

export type AuthTab = 'phone' | 'email'

const TABS: readonly AuthTab[] = ['phone', 'email']

type Props = { initial: AuthTab; phone: ReactNode; email: ReactNode }

// 「手机号 / 邮箱」 on the Chinese sign-in pages (ARCHITECTURE §7, T63): one segmented control,
// both panels stay mounted so a half-typed form survives a switch. Arrow keys move between the
// two tabs (WAI-ARIA tabs pattern, automatic activation).
export function AuthTabs({ initial, phone, email }: Props) {
  const t = useTranslations('auth.tabs')
  const [current, setCurrent] = useState<AuthTab>(initial)
  const id = useId()
  const buttons = useRef<Partial<Record<AuthTab, HTMLButtonElement | null>>>({})

  function onKeyDown(event: KeyboardEvent) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const next = current === 'phone' ? 'email' : 'phone'
    const target = event.key === 'Home' ? 'phone' : event.key === 'End' ? 'email' : next
    setCurrent(target)
    buttons.current[target]?.focus()
  }

  return (
    <>
      <div role="tablist" aria-label={t('label')} className="au-tabs" onKeyDown={onKeyDown}>
        {TABS.map((tab) => (
          <button
            key={tab}
            ref={(node) => {
              buttons.current[tab] = node
            }}
            type="button"
            role="tab"
            id={`${id}-${tab}`}
            aria-selected={current === tab}
            aria-controls={`${id}-${tab}-panel`}
            tabIndex={current === tab ? 0 : -1}
            className="au-tab"
            onClick={() => setCurrent(tab)}
          >
            {t(tab)}
          </button>
        ))}
      </div>
      {TABS.map((tab) => (
        <div key={tab} role="tabpanel" id={`${id}-${tab}-panel`} aria-labelledby={`${id}-${tab}`} hidden={current !== tab}>
          {tab === 'phone' ? phone : email}
        </div>
      ))}
    </>
  )
}
