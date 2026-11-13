'use client'

import { useTranslations } from 'next-intl'
import { useActionState, useState, type ReactNode } from 'react'

import type { ClaimState } from '../../auth/flows/claim-gift'
import type { ClaimOptions } from '../../auth/signup-gift-claim'
import { maskPhone, parseMainlandPhone, SMS_CODE_MINUTES } from '../../auth/phone/phone-number'
import { Link } from '../../i18n/ui'
import { Button } from '../../ui/button'
import { Input } from '../../ui/input'
import { Group } from './rows'

// 「领取注册赠分」 (1410, ARCHITECTURE §7): shown only to an account the per-network allowance left
// pending. Bind a phone number (code by SMS) or use a Google account; each pays one signup gift
// ever. The admin decides which of the two are offered.

type ClaimAction = (state: ClaimState, form: FormData) => Promise<ClaimState>
export type GiftClaimActions = { sendCode: ClaimAction; verifyCode: ClaimAction; google: () => Promise<ClaimState> }

type Props = { credits: number; options: ClaimOptions; actions: GiftClaimActions }

const IDLE: ClaimState = { status: 'idle' }

export function GiftClaimCard({ credits, options, actions }: Props) {
  const t = useTranslations('app.giftClaim')
  const [phoneOpen, setPhoneOpen] = useState(false)
  const [google, startGoogle, googlePending] = useActionState(async () => actions.google(), IDLE)
  if (!options.phone && !options.google) return null
  return (
    <Group title={t('title')}>
      <div className="hairline-lit space-y-3 rounded-panel bg-card p-4" data-gift-claim>
        <p className="text-body">{t('body', { perIp: options.perIp, credits })}</p>
        <Outcome state={google} credits={credits} />
        {options.phone && !phoneOpen ? (
          <Button type="button" className="w-full" onClick={() => setPhoneOpen(true)}>
            {t('phoneButton', { credits })}
          </Button>
        ) : null}
        {options.phone && phoneOpen ? <PhoneClaim credits={credits} actions={actions} /> : null}
        {options.google ? (
          <form action={startGoogle}>
            <Button type="submit" variant="outline" className="w-full" disabled={googlePending}>
              {t('googleButton')}
            </Button>
          </form>
        ) : null}
      </div>
    </Group>
  )
}

function PhoneClaim({ credits, actions }: { credits: number; actions: GiftClaimActions }) {
  const t = useTranslations('app.giftClaim')
  const [phone, setPhone] = useState('')
  const [sent, send, sending] = useActionState(actions.sendCode, IDLE)
  const [verified, verify, verifying] = useActionState(actions.verifyCode, IDLE)
  const parsed = parseMainlandPhone(phone)
  const codeStep = sent.status === 'sent'

  if (verified.status === 'claimed') return <Outcome state={verified} credits={credits} />
  return (
    <div className="space-y-3">
      <form action={send} className="space-y-3">
        <label className="grid gap-1 text-label">
          <span>{t('phoneLabel')}</span>
          <span className="flex items-center gap-2">
            <span className="text-muted-foreground">+86</span>
            <Input name="phone" type="tel" inputMode="tel" autoComplete="tel-national" placeholder={t('phonePlaceholder')} value={phone} onChange={event => setPhone(event.target.value)} readOnly={codeStep} />
          </span>
        </label>
        {codeStep ? null : (
          <>
            <label className="flex items-start gap-2 text-caption text-muted-foreground">
              <input type="checkbox" name="consent" className="mt-0.5" />
              <span>{t.rich('consent', { terms: legal('/terms'), privacy: legal('/privacy#phone-numbers'), aup: legal('/acceptable-use') })}</span>
            </label>
            <Button type="submit" className="w-full" disabled={sending}>
              {t('send')}
            </Button>
          </>
        )}
        <Outcome state={sent} credits={credits} />
      </form>
      {codeStep ? (
        <form action={verify} className="space-y-3">
          <p className="text-caption text-muted-foreground">{t('sent', { phone: maskPhone(parsed?.digits), minutes: SMS_CODE_MINUTES })}</p>
          <input type="hidden" name="phone" value={parsed?.e164 ?? ''} />
          <label className="grid gap-1 text-label">
            <span>{t('codeLabel')}</span>
            <Input name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="\d{6}" />
          </label>
          <Button type="submit" className="w-full" disabled={verifying}>
            {t('verify', { credits })}
          </Button>
          <p className="text-caption text-muted-foreground">{t('bindNote')}</p>
          <Outcome state={verified} credits={credits} />
        </form>
      ) : null}
    </div>
  )
}

// One line for whatever the last answer was: an error, a claim that did not pay, or the gift.
function Outcome({ state, credits }: { state: ClaimState; credits: number }) {
  const t = useTranslations('app.giftClaim')
  const errors = useTranslations('auth.errors')
  if (state.status === 'claimed') return <p role="status" className="text-body font-medium">{t('granted', { credits })}</p>
  if (state.status === 'unclaimed') return <p role="status" className="text-caption text-destructive">{t(`reasons.${state.reason}`)}</p>
  if (state.status === 'error') return <p role="alert" className="text-caption text-destructive">{errors(state.code)}</p>
  return null
}

const legal = (href: string) =>
  function LegalLink(chunks: ReactNode) {
    return (
      <Link href={href} target="_blank" rel="noopener" className="underline">
        {chunks}
      </Link>
    )
  }
