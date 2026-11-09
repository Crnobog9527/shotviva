'use client'

import { useRef } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '../../ui/button'
import { Input } from '../../ui/input'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '../../ui/dialog'
import { Group } from './rows'
import { DiscountSummary, type PendingDiscount } from './discount-summary'
import type { RedeemResult } from './redeem-result'
import { useRedeemCode } from './use-redeem-code'


export function RedeemCard({ pending }: { pending: PendingDiscount | null }) {
  const t = useTranslations('app.accountCodes.redeem')
  const field = useRef<HTMLInputElement>(null)
  const { busy, input, result, confirmation, changeInput, submit, cancel } = useRedeemCode(pending?.code ?? null)
  return (
    <Group title={t('title')}>
      <div className="hairline-lit space-y-3 rounded-panel bg-card p-4">
        <form className="flex flex-wrap gap-2" onSubmit={e => { e.preventDefault(); submit() }}>
          <Input ref={field} value={input} onChange={e => changeInput(e.target.value)}
            aria-label={t('label')} placeholder={t('label')} autoComplete="off" autoCapitalize="characters" spellCheck={false}
            className="h-11 min-w-32 flex-1 font-mono" disabled={busy} />
          <Button type="submit" variant="glass" size="touch" disabled={busy || !input.trim()}>{t(busy ? 'working' : 'button')}</Button>
        </form>
        <RedeemNotice result={result} />
        {pending && <DiscountSummary value={pending} />}
      </div>
      <Dialog open={confirmation !== null} onOpenChange={open => { if (!open) cancel() }}>
        <DialogContent showCloseButton={false} onCloseAutoFocus={e => { e.preventDefault(); field.current?.focus() }}>
          <DialogTitle>{t('confirmTitle')}</DialogTitle>
          <DialogDescription>{t('confirmBody', { old: confirmation?.old ?? t('current'), code: confirmation?.code ?? '' })}</DialogDescription>
          <DialogFooter>
            <Button size="touch" variant="glass" onClick={cancel}>{t('keep')}</Button>
            <Button size="touch" onClick={() => confirmation && submit(confirmation)}>{t('replace')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Group>
  )
}

function RedeemNotice({ result }: { result: RedeemResult | null }) {
  const t = useTranslations('app.accountCodes.redeem')
  if (result?.kind === 'error') return <p role="alert" className="text-label text-destructive">{t(`errors.${result.key}`)}</p>
  if (result?.kind !== 'ok') return null
  const { credits, pool, percent } = result.value
  return <p role="status" className="text-label text-success">
    {credits > 0 && t(pool === 'paid' ? 'paidGift' : 'freeGift', { credits })}
    {percent !== null && ' ' + t('saved')}
  </p>
}
