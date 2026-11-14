'use client'

import { useTranslations } from 'next-intl'
import { useId, useState } from 'react'

import { saveSignupCode } from '../signup-code-actions'
import { useSignupCodeDraft } from './signup-code-context'
import { SignupCodePreview } from './signup-code-preview'

export function SignupCodeField() {
  const draft = useSignupCodeDraft()
  const t = useTranslations('app.signupCodes')
  const [expanded, setExpanded] = useState<boolean | null>(null)
  const id = useId()
  if (!draft) return null
  const open = expanded ?? Boolean(draft.value)
  return (
    <div className="mb-3 text-sm">
      <button type="button" aria-expanded={open} aria-controls={id} className="min-h-11 text-muted-foreground underline decoration-border underline-offset-4 hover:text-foreground"
        onClick={() => setExpanded(!open)}>{t('toggle')}</button>
      <div id={id} hidden={!open}>
        <label htmlFor={`${id}-input`} className="sr-only">{t('label')}</label>
        <input id={`${id}-input`} autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={20}
          value={draft.value} onChange={event => draft.edit(event.target.value)}
          onBlur={() => { if (draft.edited) void saveSignupCode(draft.value).catch(() => {}) }}
          aria-describedby={`${id}-effect`} placeholder={t('label')}
          className="h-11 w-full rounded-md border border-input bg-background px-3 font-mono text-base focus-visible:outline-ring" />
        <div id={`${id}-effect`} aria-live="polite"><SignupCodePreview raw={draft.value} /></div>
      </div>
    </div>
  )
}
