'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useRef, useState, type ReactNode } from 'react'

import type { FormState } from '../flows/form-state'
import { maskPhone, parseMainlandPhone, SMS_CODE_MINUTES } from '../phone/phone-number'
import { SignupCodeHiddenInput } from './signup-code-context'
import { CodeField } from './code-field'
import { CaptchaFailed, FormStatus, Notice, SubmitButton } from './form-parts'
import { ConsentCheck, PhoneField } from './phone-fields'
import { useAuthForm, type AuthForm, type FormAction } from './use-auth-form'
import { useCooldown } from './use-cooldown'
import { validateCode, validatePhoneSend } from './validate'

export type PhoneActions = { send: FormAction; verify: FormAction }

type Props = {
  actions: PhoneActions
  next: string
  // The button that enters the code: 「登录」 or 「注册」.
  submitLabel: string
}

const addr = (chunks: ReactNode) => <span className="au-addr">{chunks}</span>

// Phone sign-in, the 手机号 tab (ARCHITECTURE §7, T63): number + consent → invisible hCaptcha →
// six-digit code → signed in (a new number signs up). No password.
export function PhoneSignIn({ actions, next, submitLabel }: Props) {
  const t = useTranslations('auth')
  const send = useAuthForm(actions.send, { captcha: true, validate: validatePhoneSend })
  const [phone, setPhone] = useState('')
  // 「换个号码」 puts this answer aside; the next send brings a new one.
  const [setAside, setSetAside] = useState<FormState | null>(null)

  if (send.state.status === 'sent' && send.state !== setAside) {
    return <PhoneCode phone={phone} actions={actions} next={next} submitLabel={submitLabel} onBack={() => setSetAside(send.state)} />
  }
  return (
    <>
      <LastError form={send} />
      <form method="post" onSubmit={send.onSubmit} noValidate className="au-form au-form-gap">
        <SignupCodeHiddenInput />
        <PhoneField form={send} value={phone} onChange={setPhone} />
        <ConsentCheck form={send} />
        <SubmitButton pending={send.pending}>{t('phone.send')}</SubmitButton>
        <FormStatus form={send} />
        <CaptchaFailed form={send} />
      </form>
    </>
  )
}

type CodeProps = { phone: string; actions: PhoneActions; next: string; submitLabel: string; onBack(): void }

function PhoneCode({ phone, actions, next, submitLabel, onBack }: CodeProps) {
  const t = useTranslations('auth')
  const verify = useAuthForm(actions.verify, { captcha: false, validate: validateCode })
  const [code, setCode] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const parsed = parseMainlandPhone(phone)
  const e164 = parsed?.e164 ?? ''

  // A wrong or expired code: start the six cells again (reset while rendering the new answer,
  // then put the caret back in the effect).
  const [answered, setAnswered] = useState(verify.state)
  const wrongCode = verify.state.status === 'error' && verify.state.code === 'AUTH_OTP_INVALID'
  if (verify.state !== answered) {
    setAnswered(verify.state)
    if (wrongCode) setCode('')
  }
  useEffect(() => inputRef.current?.focus(), [verify.state])

  return (
    <>
      <p className="au-sub au-sent">{t.rich('code.sent', { phone: maskPhone(parsed?.digits), minutes: SMS_CODE_MINUTES, addr })}</p>
      <LastError form={verify} />
      <form method="post" ref={formRef} onSubmit={verify.onSubmit} noValidate className="au-form au-form-gap">
        <input type="hidden" name="phone" value={e164} />
        <input type="hidden" name="next" value={next} />
        <SignupCodeHiddenInput />
        <CodeField
          form={verify}
          value={code}
          onChange={setCode}
          inputRef={inputRef}
          // After React has written the sixth digit back into the field.
          onComplete={() => requestAnimationFrame(() => formRef.current?.requestSubmit())}
        />
        <SubmitButton pending={verify.pending}>{submitLabel}</SubmitButton>
        <FormStatus form={verify} />
      </form>
      <ResendCode phone={e164} send={actions.send} />
      <button type="button" className="au-btn au-quiet au-change" onClick={onBack}>
        {t('code.change')}
      </button>
    </>
  )
}

// 「重新获取验证码」, with the same 60-second wait the server enforces (sms_request_send).
function ResendCode({ phone, send }: { phone: string; send: FormAction }) {
  const t = useTranslations('auth')
  const resend = useAuthForm(send, { captcha: true })
  const cooldown = useCooldown()
  const { start } = cooldown

  useEffect(() => start(), [start])
  useEffect(() => {
    if (resend.state.status === 'sent') start()
  }, [resend.state, start])

  const waiting = cooldown.left > 0
  return (
    <form method="post" onSubmit={resend.onSubmit} className="au-acts">
      <input type="hidden" name="phone" value={phone} />
      <input type="hidden" name="consent" value="on" />
      <LastError form={resend} />
      <button type="submit" className="au-btn au-ghost" disabled={resend.pending || waiting}>
        {waiting ? t('code.wait', { seconds: cooldown.left }) : t('code.resend')}
      </button>
      <FormStatus form={resend} />
      <CaptchaFailed form={resend} />
    </form>
  )
}

// The last answer's problem, gone while the next answer is on its way.
function LastError({ form }: { form: AuthForm }) {
  const t = useTranslations('auth')
  return form.errorCode && !form.pending ? <Notice>{t(`errors.${form.errorCode}`)}</Notice> : null
}
