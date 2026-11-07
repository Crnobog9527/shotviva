'use client'

import { useTranslations } from 'next-intl'
import { useId, type ReactNode } from 'react'

import { Link } from '../../i18n/ui'
import { FieldLines, useFieldError } from './form-parts'
import type { AuthForm } from './use-auth-form'

// The +86 number field and the consent box of phone sign-in (ARCHITECTURE §7, T63); styles are
// the au-tel / au-check classes in app/[locale]/(auth)/auth.css.

type PhoneProps = { form: AuthForm; value: string; onChange(value: string): void }

// +86 is fixed: only mainland numbers are taken. 16px type, numeric keypad, the browser's own
// "fill my number".
export function PhoneField({ form, value, onChange }: PhoneProps) {
  const t = useTranslations('auth.phone')
  const id = useId()
  const error = useFieldError(form, 'phone')
  return (
    <div className="au-field">
      <label className="au-lab" htmlFor={id}>
        {t('field')}
      </label>
      <div className="au-ctl au-tel">
        <span className="au-cc" aria-hidden="true">
          +86
        </span>
        <input
          id={id}
          className="au-input"
          type="tel"
          name="phone"
          inputMode="numeric"
          autoComplete="tel-national"
          enterKeyHint="send"
          placeholder={t('placeholder')}
          maxLength={13}
          value={value}
          aria-invalid={error ? true : undefined}
          aria-describedby={`${id}-line`}
          onChange={(event) => {
            onChange(event.target.value.replace(/[^\d\s-]/g, ''))
            form.clearField('phone')
          }}
        />
      </div>
      <FieldLines id={`${id}-line`} hint={t('hint')} error={error} />
    </div>
  )
}

// Each document opens in a new tab so the number typed so far stays put.
const legalLink = (href: string) =>
  function LegalLink(chunks: ReactNode) {
    return (
      <Link href={href} target="_blank" rel="noopener">
        {chunks}
      </Link>
    )
  }

// PIPL: its own box, unticked by default, before a code can be sent; the server checks it again.
export function ConsentCheck({ form }: { form: AuthForm }) {
  const t = useTranslations('auth.phone')
  const id = useId()
  const error = useFieldError(form, 'consent')
  return (
    <div className="au-field">
      <label className="au-check" htmlFor={id}>
        <input
          id={id}
          type="checkbox"
          name="consent"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-line` : undefined}
          onChange={() => form.clearField('consent')}
        />
        <span>
          {t.rich('consent', {
            terms: legalLink('/terms'),
            privacy: legalLink('/privacy#phone-numbers'),
            aup: legalLink('/acceptable-use'),
          })}
        </span>
      </label>
      <FieldLines id={`${id}-line`} error={error} />
    </div>
  )
}
