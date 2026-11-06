'use client'

import { useFormatter, useTranslations } from 'next-intl'

import type { Balance } from '@/core/billing/pools'
import type { CreditsCost } from '@/core/templates/pricing'
import type { OutputAspect, Resolution } from '@/core/templates/output-options'
import { cn } from '@/core/ui/cn'

import { canAfford } from './cta-state'
import { SIZE_OPTIONS, TIER_OPTIONS } from './workspace-options'

const radioInput = 'peer sr-only'
const focusRing = 'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring'

// Size (DESIGN §4.3 step 3): eight tiles four across, each with a drawn ratio glyph. A native
// radio stays in the DOM for keyboard and screen readers.
// The edit panel renders it too (T47), under its own heading and radio name.
type SizeProps = { value: OutputAspect; onChange(next: OutputAspect): void; name?: string; labelledBy?: string }

export function SizePicker({ value, onChange, name = 'size', labelledBy = 'size-h' }: SizeProps) {
  const t = useTranslations('app.sizes')
  return (
    <div role="radiogroup" aria-labelledby={labelledBy} className="grid grid-cols-4 gap-2">
      {SIZE_OPTIONS.map((size) => (
        <label key={size.id} className="relative cursor-pointer">
          <input type="radio" name={name} value={size.id} checked={value === size.id} onChange={() => onChange(size.id)} className={radioInput} />
          <span className={cn('flex min-h-[100px] flex-col items-center justify-end gap-2 rounded-button px-1 py-3 text-center transition-[box-shadow,background]', focusRing, value === size.id ? 'chosen' : 'hairline bg-card')}>
            <span className="grid h-[34px] w-10 place-items-center">
              <i
                className={cn('block rounded-[3px] border-[1.5px]', size.glyph.dashed && 'border-dashed', value === size.id ? 'border-primary bg-safelight-tint' : 'border-[var(--glyph)]')}
                style={{ width: size.glyph.w, height: size.glyph.h }}
              />
            </span>
            <b className="text-caption leading-none font-semibold tracking-[-0.02em]">{t(size.id)}</b>
            <small className={cn('text-caption leading-none text-muted-foreground', size.ratio && 'font-mono tracking-[-0.03em]')}>{size.ratio ?? t('asShot')}</small>
          </span>
        </label>
      ))}
    </div>
  )
}

type ResolutionProps = { value: Resolution; costs: CreditsCost; balance: Balance; onChange(next: Resolution): void }

// Resolution (DESIGN §4.3 step 3b): Standard / HD / Max as stacked cards with this template's
// credits on the right; a tier neither pool covers shows its credits greyed.
export function ResolutionPicker({ value, costs, balance, onChange }: ResolutionProps) {
  const t = useTranslations('app')
  const format = useFormatter()
  return (
    <div role="radiogroup" aria-labelledby="res-h" className="grid gap-2">
      {TIER_OPTIONS.map((tier) => {
        const cost = costs[tier.id]
        const affordable = canAfford(balance, cost)
        return (
          <label key={tier.id} className="relative cursor-pointer">
            <input type="radio" name="resolution" value={tier.id} checked={value === tier.id} onChange={() => onChange(tier.id)} className={radioInput} />
            <span className={cn('grid min-h-16 grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 rounded-control py-4 pr-4 pl-4 transition-[box-shadow,background]', focusRing, value === tier.id ? 'chosen' : 'hairline bg-card')}>
              <span className="flex items-baseline gap-2 text-body leading-[1.2] font-semibold">
                {t(`tiers.${tier.id}.name`)}
                <span className="font-mono text-caption leading-none font-normal text-muted-foreground">{t('units.px', { px: tier.px })}</span>
              </span>
              <span className={cn('col-start-2 row-span-2 row-start-1 text-right font-display text-[24px] leading-none', !affordable && 'text-muted-foreground')}>
                {format.number(cost)}
                <small className="mt-1 block font-sans text-caption leading-none text-muted-foreground">{t('creditsUnit', { count: cost })}</small>
              </span>
              <span className="col-start-1 text-caption text-muted-foreground">
                {t(`tiers.${tier.id}.use`)}
                {affordable ? null : <span className="sr-only"> {t('tiers.notEnough')}</span>}
              </span>
            </span>
          </label>
        )
      })}
    </div>
  )
}
