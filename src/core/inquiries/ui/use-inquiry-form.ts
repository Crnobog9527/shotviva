'use client'

import { useCallback, useState, useTransition } from 'react'

import { trackBusinessInquiry } from '../../analytics/browser'
import { useCaptcha } from '../../auth/ui/use-captcha'
import type { InquiryPage } from '../rules'
import type { SubmitError, SubmitOutcome } from '../submit'
import { EMPTY_INQUIRY, FIELD_ORDER, fieldError, validateInquiry, type FieldErrors, type InquiryField, type InquiryValues } from '../validate'

export type InquiryActions = {
  submit(input: { page: InquiryPage; values: InquiryValues; captchaToken: string | null }): Promise<SubmitOutcome>
}

function withError(shown: FieldErrors, field: InquiryField, error: FieldErrors[InquiryField] | null): FieldErrors {
  const next = { ...shown }
  if (error) next[field] = error
  else delete next[field]
  return next
}

// The form's state: the values, the errors shown, and the send. A field's error appears once the
// visitor leaves it (or presses Send) and updates as they type; Send checks everything, moves
// focus to the first field to fix and says so in the send bar.
export function useInquiryForm(page: InquiryPage, actions: InquiryActions) {
  const [values, setValues] = useState<InquiryValues>(EMPTY_INQUIRY)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [touched, setTouched] = useState<ReadonlySet<InquiryField>>(new Set())
  const [failed, setFailed] = useState<SubmitError | 'checkFields' | null>(null)
  const [sent, setSent] = useState(false)
  const [pending, startSending] = useTransition()
  const captcha = useCaptcha()

  // Choices count as "left" the moment one is picked; text fields once blurred.
  const set = <K extends InquiryField>(field: K, value: InquiryValues[K]) => {
    const next = { ...values, [field]: value }
    const choice = typeof value !== 'string'
    setValues(next)
    if (choice) setTouched((seen) => new Set(seen).add(field))
    if (choice || touched.has(field)) setErrors((shown) => withError(shown, field, fieldError(field, next)))
  }

  // The signed-in visitor's email (and phone), once it arrives, into fields still empty.
  const fill = useCallback((start: Partial<Pick<InquiryValues, 'email' | 'phone'>>) => {
    setValues((current) => ({ ...current, email: current.email || start.email || '', phone: current.phone || start.phone || '' }))
  }, [])

  const leave = (field: InquiryField) => {
    setTouched((seen) => new Set(seen).add(field))
    setErrors((shown) => withError(shown, field, fieldError(field, values)))
  }

  const send = () => {
    const found = validateInquiry(values)
    setErrors(found)
    setTouched(new Set(FIELD_ORDER))
    const first = FIELD_ORDER.find((field) => found[field])
    if (first) {
      setFailed('checkFields')
      document.getElementById(`iq-${first}`)?.focus()
      return
    }
    setFailed(null)
    startSending(async () => {
      const token = await captcha.getToken()
      if (token === null) return setFailed('CAPTCHA_FAILED')
      const outcome = await actions.submit({ page, values, captchaToken: token ?? null }).catch((): SubmitOutcome => ({ ok: false, error: 'generic' }))
      if (outcome.ok) {
        if (values.volume) trackBusinessInquiry({ volume: values.volume, uses: values.uses })
        return setSent(true)
      }
      if (outcome.fields) setErrors(outcome.fields)
      setFailed(outcome.error)
    })
  }

  return { values, errors, set, fill, leave, send, pending, failed, sent }
}

export type InquiryForm = ReturnType<typeof useInquiryForm>
