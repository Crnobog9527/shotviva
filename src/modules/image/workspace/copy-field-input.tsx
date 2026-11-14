'use client'

import { useTranslations } from 'next-intl'
import type { FocusEvent } from 'react'

import { cn } from '@/core/ui/cn'

import type { CatalogueCopyField } from '../catalogue/catalogue-template'

// Fields scroll into view on focus so the keyboard never hides them (DESIGN §8.5). 16px
// text everywhere, so iOS never zooms (The 16px Input Rule).
export const reveal = (event: FocusEvent<HTMLElement>) => event.currentTarget.scrollIntoView({ block: 'center', behavior: 'smooth' })

export const fieldClass =
  'w-full resize-none rounded-control border-0 bg-wash-faint p-4 text-body leading-[1.45] text-foreground shadow-[inset_0_0_0_1px_var(--input)] transition-shadow placeholder:text-muted-foreground focus:shadow-[inset_0_0_0_1.5px_var(--primary),0_0_0_4px_var(--safelight-halo)] focus:outline-none'

// Up to this many choices show as tappable chips; more become a native list (one tap, and the
// phone's own picker).
const CHIPS_MAX = 6

// example: the value is still the cover's text (copy-examples.ts), drawn greyer until edited.
type Props = { field: CatalogueCopyField; id: string; value: string; describedBy?: string; example?: boolean; onChange(next: string): void }

// One admin-defined field (ARCHITECTURE §5 fields.copy) drawn for its type. The server checks
// the same rules again; these attributes only spare the user a refused Generate.
export function CopyFieldInput({ field, id, value, describedBy, example, onChange }: Props) {
  const common = { id, value, required: field.required, 'aria-describedby': describedBy, onFocus: reveal }
  if (field.type === 'long') {
    return (
      <textarea {...common} rows={4} maxLength={field.maxLength} placeholder={field.placeholder} autoCapitalize="sentences"
        onChange={(event) => onChange(event.target.value)} className={cn(fieldClass, 'min-h-[120px]', example && 'text-muted-foreground')} />
    )
  }
  if (field.type === 'select') return <ChoiceInput field={field} id={id} value={value} describedBy={describedBy} onChange={onChange} />
  const number = field.type === 'number'
  return (
    <input {...common} maxLength={field.maxLength} placeholder={field.placeholder} enterKeyHint="done"
      inputMode={number ? 'decimal' : undefined} autoCapitalize={number ? 'off' : 'sentences'} autoComplete="off"
      onChange={(event) => onChange(event.target.value)} className={cn(fieldClass, 'h-13 py-0', example && 'text-muted-foreground')} />
  )
}

function ChoiceInput({ field, id, value, describedBy, onChange }: Props) {
  const t = useTranslations('app.workspace')
  const options = field.options ?? []
  if (options.length > CHIPS_MAX) {
    return (
      <select id={id} value={value} required={field.required} aria-describedby={describedBy} onFocus={reveal}
        onChange={(event) => onChange(event.target.value)} className={cn(fieldClass, 'h-13 appearance-none py-0', !value && 'text-muted-foreground')}>
        <option value="">{field.placeholder || t('choose')}</option>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    )
  }
  // A radio group the label names; an optional choice can be cleared by tapping it again.
  return (
    <div id={id} role="radiogroup" aria-labelledby={`${id}-label`} aria-describedby={describedBy} className="flex flex-wrap gap-2">
      {options.map((option) => {
        const chosen = value === option.value
        return (
          <label key={option.value} className="relative cursor-pointer">
            <input type="radio" name={id} value={option.value} checked={chosen} className="peer sr-only"
              onChange={() => onChange(option.value)} onClick={() => chosen && !field.required && onChange('')} />
            <span className={cn('inline-flex min-h-11 items-center rounded-button px-4 text-label font-medium transition-[box-shadow,background]',
              'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring', chosen ? 'chosen' : 'hairline bg-card')}>
              {option.label}
            </span>
          </label>
        )
      })}
    </div>
  )
}
