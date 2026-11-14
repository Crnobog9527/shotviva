'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useState, type ReactNode } from 'react'

import { LanguageOptions } from '../../i18n/ui'
import { ResponsiveSheet } from '../../ui/responsive-sheet'
import { RowValue, rowClass } from './rows'

// The two Settings rows that open a sheet (bottom drawer on phones, 480px dialog from md,
// DESIGN §8.4): Language, and Purchases (purchases-row.tsx).

type SheetRowProps = {
  label: string
  value: ReactNode
  title: string
  description: string
  children: ReactNode
  // Opened on arrival (Purchases after a receipt could not be opened, T80).
  initialOpen?: boolean
  onClose?(): void
}

export function SheetRow({ label, value, title, description, children, initialOpen = false, onClose }: SheetRowProps) {
  const [open, setOpen] = useState(initialOpen)
  const change = (next: boolean) => {
    setOpen(next)
    if (!next) onClose?.()
  }
  return (
    <>
      <button type="button" aria-haspopup="dialog" onClick={() => setOpen(true)} className={rowClass}>
        {label}
        <RowValue>{value}</RowValue>
      </button>
      <ResponsiveSheet open={open} onOpenChange={change} title={title} description={description}>
        {children}
      </ResponsiveSheet>
    </>
  )
}

export function LanguageRow() {
  const t = useTranslations('app.account')
  const names = useTranslations('locale.menu')
  const locale = useLocale() === 'zh' ? 'zh' : 'en'
  return (
    <SheetRow label={t('settings.language')} value={names(locale)} title={t('language.title')} description={t('language.lead')}>
      <LanguageOptions />
    </SheetRow>
  )
}
