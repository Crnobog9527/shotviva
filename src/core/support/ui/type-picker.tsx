'use client'

import { useTranslations } from 'next-intl'

import { cn } from '../../ui/cn'
import { TICKET_TYPES, type TicketType } from '../rules'

// One plain list, every type styled alike: a refund request is not singled out by colour, icon
// or position beyond following billing (ARCHITECTURE §10 「站内工单」).
export function TypePicker({ value, onChange }: { value: TicketType | null; onChange(type: TicketType): void }) {
  const t = useTranslations('app.support')
  return (
    <fieldset className="grid gap-2">
      <legend className="pb-2 text-headline font-semibold">{t('new.typeLabel')}</legend>
      <div className="hairline-lit grid overflow-hidden rounded-panel bg-card">
        {TICKET_TYPES.map((type) => (
          <label
            key={type}
            className={cn(
              'press flex min-h-12 cursor-pointer items-center gap-3 px-4 text-body',
              'not-last:shadow-[inset_0_-1px_0_var(--border)]',
            )}
          >
            <input
              type="radio"
              name="type"
              value={type}
              required
              checked={value === type}
              onChange={() => onChange(type)}
              className="size-5 accent-[var(--primary)]"
            />
            {t(`types.${type}`)}
          </label>
        ))}
      </div>
    </fieldset>
  )
}
