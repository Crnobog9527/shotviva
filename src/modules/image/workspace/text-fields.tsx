'use client'

import { useTranslations } from 'next-intl'

import { NOTE_MAX_LENGTH } from '@/core/templates/output-options'

import type { CatalogueTemplate } from '../catalogue/catalogue-template'
import { CopyFieldInput, fieldClass, reveal } from './copy-field-input'

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

// idPrefix: field ids must stay unique when several templates' fields share a page (T107).
type CopyProps = { fields: CatalogueTemplate['copyFields']; values: Record<string, string>; onChange(next: Record<string, string>): void; idPrefix?: string }

// Only what a template asks for, e.g. a poster's headline and price (DESIGN §4.3 step 2): each
// field as its admin-chosen type, with its help line and, for long text, a counter.
export function CopyFields({ fields, values, onChange, idPrefix = 'copy' }: CopyProps) {
  const t = useTranslations('app.workspace')
  if (fields.length === 0) return null
  return (
    <div className="grid gap-4">
      {fields.map((field) => {
        const id = `${idPrefix}-${field.key}`
        const value = values[field.key] ?? ''
        const counted = field.type === 'long'
        const describedBy = [field.help ? `${id}-help` : '', counted ? `${id}-count` : ''].filter(Boolean).join(' ') || undefined
        return (
          <div key={field.key}>
            <label id={`${id}-label`} htmlFor={id} className="mb-2 flex items-baseline gap-2 text-label leading-[1.3] font-medium">
              {field.label}
              {field.required ? null : <span className="font-normal text-muted-foreground">{t('optional')}</span>}
            </label>
            <CopyFieldInput field={field} id={id} value={value} describedBy={describedBy} onChange={(next) => onChange({ ...values, [field.key]: next })} />
            {field.help || counted ? (
              <p className="mt-2 flex items-baseline justify-between gap-3 text-caption leading-[1.4] text-muted-foreground">
                <span id={`${id}-help`}>{field.help}</span>
                {counted ? <span id={`${id}-count`} className="shrink-0 font-mono leading-none">{t('counter', { count: value.length, max: field.maxLength })}</span> : null}
              </p>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

export { missingRequiredCopy } from './copy-check'
