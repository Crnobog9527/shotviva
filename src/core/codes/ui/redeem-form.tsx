'use client'

import dynamic from 'next/dynamic'
import { useRef } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '../../ui/button'
import { Input } from '../../ui/input'
import type { RedeemResult } from './redeem-result'
import { useRedeemCode } from './use-redeem-code'

const ReplaceDialog = dynamic(() => import('./replace-dialog').then(module => module.ReplaceDialog))

type Props = { pendingCode: string | null; context: 'account' | 'paywall'; onRedeemed?: () => void }

export function RedeemForm({ pendingCode, context, onRedeemed }: Props) {
  const t = useTranslations('app.accountCodes.redeem')
  const field = useRef<HTMLInputElement>(null)
  const { busy, input, result, confirmation, changeInput, submit, cancel } = useRedeemCode(pendingCode, context, onRedeemed)
  return (
    <>
      <div className="space-y-3">
        <form className="flex flex-wrap gap-2" onSubmit={e => { e.preventDefault(); submit() }}>
          <Input ref={field} value={input} onChange={e => changeInput(e.target.value)}
            aria-label={t('label')} placeholder={t('label')} autoComplete="off" autoCapitalize="characters" spellCheck={false}
            className="h-11 min-w-32 flex-1 font-mono" disabled={busy} />
          <Button type="submit" variant="glass" size="touch" disabled={busy || !input.trim()}>{t(busy ? 'working' : 'button')}</Button>
        </form>
        <RedeemNotice result={result} />
      </div>
      {confirmation && <ReplaceDialog old={confirmation.old} code={confirmation.code} cancel={cancel}
        replace={() => submit(confirmation)} restoreFocus={() => field.current?.focus()} />}
    </>
  )
}

function RedeemNotice({ result }: { result: RedeemResult | null }) {
  const t = useTranslations('app.accountCodes.redeem')
  if (result?.kind === 'error') return <p role="alert" className="text-label text-destructive">{t(`errors.${result.key}`)}</p>
  if (result?.kind !== 'ok') return null
  const { credits, pool, percent } = result.value
  return <p role="status" className="text-label text-success">
    {credits === 0 && percent === null && t('inviteLinked')}
    {credits > 0 && t(pool === 'paid' ? 'paidGift' : 'freeGift', { credits })}
    {percent !== null && ' ' + t('saved')}
  </p>
}
