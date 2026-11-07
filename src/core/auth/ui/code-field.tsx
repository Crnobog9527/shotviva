'use client'

import { useTranslations } from 'next-intl'
import { useId, type RefObject } from 'react'

import { FieldLines, useFieldError } from './form-parts'
import type { AuthForm } from './use-auth-form'

export const CODE_LENGTH = 6

type Props = {
  form: AuthForm
  value: string
  onChange(value: string): void
  // The sixth digit was entered (typed, pasted or filled from the SMS): the caller submits.
  onComplete(): void
  inputRef: RefObject<HTMLInputElement | null>
}

// Six cells, one real input (T63). The input lies over the cells, transparent, so typing, paste
// and iOS / Android "fill from Messages" (autocomplete one-time-code) all land in one field and
// one label; the cells only draw what it holds and where the next digit goes.
export function CodeField({ form, value, onChange, onComplete, inputRef }: Props) {
  const t = useTranslations('auth.code')
  const id = useId()
  const error = useFieldError(form, 'code')
  const active = Math.min(value.length, CODE_LENGTH - 1)
  return (
    <div className="au-field">
      <label className="au-lab" htmlFor={id}>
        {t('field')}
      </label>
      <div className="au-code">
        <div className="au-cells" aria-hidden="true">
          {Array.from({ length: CODE_LENGTH }, (_, index) => (
            <span key={index} className="au-cell" data-filled={index < value.length || undefined} data-active={index === active || undefined}>
              {value[index] ?? ''}
            </span>
          ))}
        </div>
        <input
          ref={inputRef}
          id={id}
          className="au-code-input"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          enterKeyHint="done"
          pattern="[0-9]*"
          maxLength={CODE_LENGTH}
          value={value}
          aria-invalid={error ? true : undefined}
          aria-describedby={`${id}-line`}
          onChange={(event) => {
            const digits = event.target.value.replace(/\D/g, '').slice(0, CODE_LENGTH)
            onChange(digits)
            form.clearField('code')
            if (digits.length === CODE_LENGTH && value.length < CODE_LENGTH) onComplete()
          }}
        />
      </div>
      <FieldLines id={`${id}-line`} hint={t('hint')} error={error} />
    </div>
  )
}
