'use client'

import { useRef, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { normalizeCode } from '../../codes'
import { Button } from '../../ui/button'
import { Input } from '../../ui/input'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '../../ui/dialog'
import { Group } from './rows'
import { DiscountSummary, type PendingDiscount } from './discount-summary'
import { redeemResult, type RedeemResult } from './redeem-result'

type Confirmation = { old: string | null; code: string }

export function RedeemCard({ pending }: { pending: PendingDiscount | null }) {
  const t = useTranslations('app.accountCodes.redeem')
  const router = useRouter()
  const field = useRef<HTMLInputElement>(null)
  const [input, setInput] = useState('')
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  const [result, setResult] = useState<RedeemResult | null>(null)
  const [busy, start] = useTransition()

  function submit(replacement?: Confirmation) {
    const code = replacement?.code ?? normalizeCode(input)
    setConfirmation(null)
    if (!code) { setResult({ kind: 'error', key: 'invalid' }); return }
    setResult(null)
    start(async () => {
      try {
        const response = await fetch('/api/codes/redeem', { method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ code, context: 'account', replace: Boolean(replacement) }) })
        const outcome = redeemResult(response.ok, await response.json().catch(() => null))
        if (outcome.kind === 'confirm') setConfirmation({ old: outcome.old ?? pending?.code ?? null, code })
        else setResult(outcome)
        if (outcome.kind === 'ok') { setInput(''); router.refresh() }
      } catch { setResult({ kind: 'error', key: 'unknown' }) }
    })
  }
  return (
    <Group title={t('title')}>
      <div className="hairline-lit space-y-3 rounded-panel bg-card p-4">
        <form className="flex flex-wrap gap-2" onSubmit={e => { e.preventDefault(); submit() }}>
          <Input ref={field} value={input} onChange={e => { setInput(e.target.value); setResult(null) }}
            aria-label={t('label')} placeholder={t('label')} autoComplete="off" autoCapitalize="characters" spellCheck={false}
            className="h-11 min-w-32 flex-1 font-mono" disabled={busy} />
          <Button type="submit" variant="glass" size="touch" disabled={busy || !input.trim()}>{t(busy ? 'working' : 'button')}</Button>
        </form>
        <RedeemNotice result={result} />
        {pending && <DiscountSummary value={pending} />}
      </div>
      <Dialog open={confirmation !== null} onOpenChange={open => { if (!open) setConfirmation(null) }}>
        <DialogContent showCloseButton={false} onCloseAutoFocus={e => { e.preventDefault(); field.current?.focus() }}>
          <DialogTitle>{t('confirmTitle')}</DialogTitle>
          <DialogDescription>{t('confirmBody', { old: confirmation?.old ?? t('current'), code: confirmation?.code ?? '' })}</DialogDescription>
          <DialogFooter>
            <Button size="touch" variant="glass" onClick={() => setConfirmation(null)}>{t('keep')}</Button>
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
