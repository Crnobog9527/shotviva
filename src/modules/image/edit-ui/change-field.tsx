'use client'

import { useTranslations } from 'next-intl'
import { useRef } from 'react'

import { INSTRUCTION_MAX_LENGTH } from '@/core/templates/edit-params'
import { cn } from '@/core/ui/cn'

const TRIES = ['beach', 'background', 'brighter'] as const

type Props = { value: string; showRequired: boolean; onChange(next: string): void }

// "What would you like to change?" (T6 comp): required, 500 characters, a counter, the
// "Say what to change first." line after an empty press, and three examples that fill it in.
export function ChangeField({ value, showRequired, onChange }: Props) {
  const t = useTranslations('app.edit')
  const field = useRef<HTMLTextAreaElement>(null)
  const fill = (text: string) => {
    onChange(text)
    field.current?.focus()
  }
  return (
    <section className="grid gap-2">
      <label htmlFor="edit-change" className="text-body font-medium">
        {t('label')}
      </label>
      <textarea
        ref={field}
        id="edit-change"
        data-edit-field
        required
        rows={3}
        maxLength={INSTRUCTION_MAX_LENGTH}
        enterKeyHint="done"
        autoCapitalize="sentences"
        placeholder={t('placeholder')}
        aria-invalid={showRequired || undefined}
        aria-describedby={showRequired ? 'edit-required' : undefined}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="hairline min-h-24 w-full resize-none rounded-control bg-card px-4 py-3 text-[16px] leading-[1.4] outline-none placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring"
      />
      <p className="text-right font-mono text-caption text-muted-foreground">{t('counter', { count: value.length, max: INSTRUCTION_MAX_LENGTH })}</p>
      {showRequired ? (
        <p id="edit-required" role="alert" className="text-caption text-primary">
          {t('required')}
        </p>
      ) : null}
      <div aria-label={t('examples')} role="group" className="flex flex-wrap gap-2">
        {TRIES.map((key) => (
          <button key={key} type="button" onClick={() => fill(t(`tries.${key}`))} className={cn('hairline min-h-11 rounded-full bg-card px-4 text-caption text-bone-dim')}>
            {t(`tries.${key}`)}
          </button>
        ))}
      </div>
    </section>
  )
}
