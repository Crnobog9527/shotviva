'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useState, type ReactNode } from 'react'

import { LanguageOptions, Link } from '../../i18n/ui'
import { EmptyState, STATE_GHOST } from '../../ui/empty-state'
import { ResponsiveSheet } from '../../ui/responsive-sheet'
import { RowValue, rowClass } from './rows'

// The two Settings rows that open a sheet (bottom drawer on phones, 480px dialog from md,
// DESIGN §8.4): Language and Purchases.

function SheetRow({ label, value, title, description, children }: { label: string; value: ReactNode; title: string; description: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" aria-haspopup="dialog" onClick={() => setOpen(true)} className={rowClass}>
        {label}
        <RowValue>{value}</RowValue>
      </button>
      <ResponsiveSheet open={open} onOpenChange={setOpen} title={title} description={description}>
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

// One line per payment, worded on the server ("Pro · Monthly · $49.90 · Nov 6, 2026").
export type PurchaseLine = { value: string; label: string }

export function PurchasesRow({ purchases, more }: { purchases: readonly PurchaseLine[]; more: boolean }) {
  const t = useTranslations('app.account')
  const count = purchases.length
  const value =
    count === 0 ? t('settings.purchasesNone') : <span className="font-mono tracking-normal">{more ? t('settings.purchasesMany', { count }) : count}</span>
  return (
    <SheetRow label={t('settings.purchases')} value={value} title={t('purchases.title')} description={t('purchases.lead')}>
      {count === 0 ? (
        <EmptyState
          icon="receipt"
          title={t('purchases.empty')}
          body={t('purchases.emptyBody')}
          action={
            <Link href="/pricing" className={STATE_GHOST}>
              {t('purchases.seePlans')}
            </Link>
          }
          className="mx-0 md:mx-0"
        />
      ) : (
        <ul className="mt-4 divide-y divide-hairline">
          {purchases.map((line) => (
            <li key={line.value} className="py-3 text-body">
              {line.label}
            </li>
          ))}
        </ul>
      )}
    </SheetRow>
  )
}
