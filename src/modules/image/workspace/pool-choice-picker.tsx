'use client'

import { useTranslations } from 'next-intl'

import type { PoolChoice, PoolChoiceOffer } from '@/core/billing/pools'
import { cn } from '@/core/ui/cn'

// 出图时让员工自选 (ARCHITECTURE §6.5): shown only when the member holds both kinds of org
// credits. Each option says what the work will be and how much of that kind is left.
export function PoolChoicePicker({ offer, value, onChange }: { offer: PoolChoiceOffer; value: PoolChoice; onChange: (next: PoolChoice) => void }) {
  const t = useTranslations('app.poolChoice')
  const option = (kind: PoolChoice, left: number) => (
    <label
      key={kind}
      className={cn('flex min-h-11 cursor-pointer items-start gap-3 rounded-md border px-3 py-2', value === kind ? 'border-primary bg-primary/5' : 'border-input')}
    >
      <input type="radio" name="pool-choice" value={kind} checked={value === kind} onChange={() => onChange(kind)} className="mt-1 size-4 accent-[var(--primary)]" />
      <span className="min-w-0">
        <span className="block text-label font-medium">{t(kind)}</span>
        <span className="block text-caption text-muted-foreground tabular-nums">{t('left', { count: left })}</span>
      </span>
    </label>
  )
  return (
    <fieldset data-slot="pool-choice" className="grid gap-2">
      <legend className="mb-1 text-label font-medium">{t('title')}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {option('promo', offer.promo)}
        {option('paid', offer.paid)}
      </div>
      <p className="text-caption text-muted-foreground">{t('hint')}</p>
    </fieldset>
  )
}

// The picker in a form, or nothing when there is no choice to make.
export function PoolChoiceSlot({ choice }: { choice: { offer: PoolChoiceOffer; value: PoolChoice; set: (next: PoolChoice) => void } | null }) {
  if (!choice) return null
  return <div className="mt-4"><PoolChoicePicker offer={choice.offer} value={choice.value} onChange={choice.set} /></div>
}
