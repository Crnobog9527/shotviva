'use client'

import { useTranslations } from 'next-intl'
import type { FocusEvent } from 'react'

import { NOTE_MAX_LENGTH } from '@/core/templates/output-options'

import type { CatalogueTemplate } from '../catalogue/catalogue-template'

// Fields scroll into view on focus so the keyboard never hides them (DESIGN §8.5). 16px
// text everywhere, so iOS never zooms (The 16px Input Rule).
const reveal = (event: FocusEvent<HTMLElement>) => event.currentTarget.scrollIntoView({ block: 'center', behavior: 'smooth' })

const fieldClass =
  'w-full resize-none rounded-control border-0 bg-wash-faint p-4 text-body leading-[1.45] text-foreground shadow-[inset_0_0_0_1px_var(--input)] transition-shadow placeholder:text-muted-foreground focus:shadow-[inset_0_0_0_1.5px_var(--primary),0_0_0_4px_var(--safelight-halo)] focus:outline-none'

// "Anything to change? (optional)" (DESIGN §4.3 step 2b): never called a prompt, ≤300 chars.
export function NoteField({ value, placeholder, onChange }: { value: string; placeholder: string; onChange(next: string): void }) {
  const t = useTranslations('app.workspace')
  return (
    <div>
      <label htmlFor="note" className="mb-2 flex items-baseline gap-2 text-label leading-[1.3] font-medium">
        {t('noteLabel')} <span className="font-normal text-muted-foreground">{t('optional')}</span>
      </label>
      <textarea
        id="note"
        rows={3}
        maxLength={NOTE_MAX_LENGTH}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onFocus={reveal}
        enterKeyHint="done"
        autoCapitalize="sentences"
        placeholder={placeholder}
        aria-describedby="note-count"
        className={`${fieldClass} min-h-[92px]`}
      />
      <p id="note-count" className="mt-2 text-right font-mono text-caption leading-none text-muted-foreground">
        {t('counter', { count: value.length, max: NOTE_MAX_LENGTH })}
      </p>
    </div>
  )
}

type CopyProps = { fields: CatalogueTemplate['copyFields']; values: Record<string, string>; onChange(next: Record<string, string>): void }

// Only the text a template needs, e.g. a poster's headline and price (DESIGN §4.3 step 2).
export function CopyFields({ fields, values, onChange }: CopyProps) {
  const t = useTranslations('app.workspace')
  if (fields.length === 0) return null
  return (
    <div className="grid gap-4">
      {fields.map((field) => (
        <div key={field.key}>
          <label htmlFor={`copy-${field.key}`} className="mb-2 flex items-baseline gap-2 text-label leading-[1.3] font-medium">
            {field.label}
            {field.required ? null : <span className="font-normal text-muted-foreground">{t('optional')}</span>}
          </label>
          <input
            id={`copy-${field.key}`}
            value={values[field.key] ?? ''}
            maxLength={field.maxLength}
            required={field.required}
            onChange={(event) => onChange({ ...values, [field.key]: event.target.value })}
            onFocus={reveal}
            enterKeyHint="done"
            autoCapitalize="sentences"
            className={`${fieldClass} h-13 py-0`}
          />
        </div>
      ))}
    </div>
  )
}

export const missingRequiredCopy = (fields: CatalogueTemplate['copyFields'], values: Record<string, string>) =>
  fields.some((field) => field.required && !(values[field.key] ?? '').trim())
