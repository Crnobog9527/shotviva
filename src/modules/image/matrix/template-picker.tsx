'use client'

/* eslint-disable @next/next/no-img-element -- template covers from the catalogue */
import { useTranslations } from 'next-intl'

import { buttonVariants } from '@/core/ui/button'
import { cn } from '@/core/ui/cn'
import { ResponsiveSheet } from '@/core/ui/responsive-sheet'

import type { CatalogueTemplate } from '../catalogue/catalogue-template'

type Props = {
  open: boolean
  onOpenChange(open: boolean): void
  templates: readonly CatalogueTemplate[]
  chosen: readonly string[]
  // The plan's number of templates: Max picks up to five, Pro one (a tap swaps it and closes).
  max: number
  onToggle(id: string): void
}

// Choosing the batch's templates (T107): every template that takes a photo, as a grid of covers
// with a check; up to the plan's number, the rest wait greyed once it is reached. One Done
// closes it. On a plan that holds one template a tap chooses it, so nothing waits greyed.
export function TemplatePicker({ open, onOpenChange, templates, chosen, max, onToggle }: Props) {
  const t = useTranslations('app.matrix')
  const full = max > 1 && chosen.length >= max
  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      wide
      title={t(max > 1 ? 'pickerTitle' : 'pickerTitleOne')}
      description={max > 1 ? t('pickerLine', { count: chosen.length, max }) : t('pickerLineOne')}
      footer={
        <button type="button" onClick={() => onOpenChange(false)} className={buttonVariants({ variant: 'cta', size: 'cta' })}>
          {t('pickerDone', { count: chosen.length })}
        </button>
      }
    >
      <ul className="grid grid-cols-3 gap-x-2 gap-y-3 pt-2 md:grid-cols-5 md:gap-x-3">
        {templates.map((template) => {
          const on = chosen.includes(template.id)
          const disabled = full && !on
          const cover = template.cover.after ?? template.cover.poster
          return (
            <li key={template.id}>
              <button
                type="button"
                aria-pressed={on}
                disabled={disabled}
                onClick={() => onToggle(template.id)}
                className="press group block w-full text-left disabled:cursor-not-allowed disabled:opacity-45"
              >
                <span className="relative block aspect-[4/5] overflow-hidden rounded-[12px] bg-muted">
                  {cover ? <img src={cover} alt="" loading="lazy" decoding="async" className="absolute inset-0 size-full object-cover" /> : null}
                  {/* The rim sits over the cover: an inset shadow on the frame would be under it. */}
                  <span aria-hidden="true" className={cn('pointer-events-none absolute inset-0 rounded-[12px]', on ? 'shadow-[inset_0_0_0_2px_var(--primary)]' : 'shadow-[inset_0_0_0_1px_var(--border)]')} />
                  <Check on={on} />
                </span>
                <b className="mt-1.5 line-clamp-2 block text-caption leading-[1.3] font-semibold">{template.name}</b>
              </button>
            </li>
          )
        })}
      </ul>
    </ResponsiveSheet>
  )
}

function Check({ on }: { on: boolean }) {
  return (
    <span aria-hidden="true" className={cn('absolute top-1.5 right-1.5 grid size-6 place-items-center rounded-full', on ? 'bg-primary text-primary-foreground' : 'frost text-transparent shadow-[inset_0_0_0_1.5px_rgba(255,255,255,.7)]')}>
      <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12.5l4.5 4.5L19 7.5" />
      </svg>
    </span>
  )
}
