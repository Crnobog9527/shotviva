'use client'
import { useActionState, useRef } from 'react'
import { Button } from '@/core/ui/button'
import { Input } from '@/core/ui/input'
import { COPY } from './copy'
import type { SaveAction } from './form'
import { PROMO_TOPUP_MAX, TOPUP_COPY as T } from './promo-topup-copy'

// The 「临时追加」 form of one partner (ARCHITECTURE §6.5 渠道商推广积分). The request key is made in
// the browser when the form is first submitted and written into the form at submit time, so every
// submit until a top-up went through carries the same key: a double click or a retry is granted
// once (admin_partner_promo_topup answers 'already'). Only a granted answer starts a new key.
// `recipient` and `period` are what the page showed: if either changed the database refuses
// ('changed').
type Props = { action: SaveAction; orgId: string; orgName: string; recipient: string; period: string }

export function PromoTopupForm({ action, orgId, orgName, recipient, period }: Props) {
  const key = useRef<string | null>(null)
  const [message, submit, busy] = useActionState(async (prev: string, form: FormData) => {
    const answer = await action(prev, form)
    if (answer === T.answers.granted) key.current = null
    return answer
  }, '')
  return (
    <form
      action={submit}
      onSubmit={(event) => {
        const form = event.currentTarget
        const credits = Number(new FormData(form).get('credits'))
        if (!window.confirm(T.confirmAsk(orgName, credits))) return event.preventDefault()
        key.current ??= crypto.randomUUID()
        ;(form.elements.namedItem('request_key') as HTMLInputElement).value = key.current
      }}
      className="grid gap-3 rounded-lg border border-border p-4">
      <input type="hidden" name="operation" value="promoTopup" />
      <input type="hidden" name="org_id" value={orgId} />
      <input type="hidden" name="recipient" value={recipient} />
      <input type="hidden" name="period" value={period} />
      <input type="hidden" name="request_key" defaultValue="" />
      <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
        <label className="grid min-w-0 gap-1 text-sm">
          <span>{T.amount}</span>
          <Input name="credits" type="number" inputMode="numeric" min={1} max={PROMO_TOPUP_MAX} step={1} required />
        </label>
        <label className="grid min-w-0 gap-1 text-sm">
          <span>{T.reason}</span>
          <Input name="reason" required maxLength={500} />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? COPY.saving : T.submit}
        </Button>
        <span role="status" className="text-sm text-muted-foreground">
          {message}
        </span>
      </div>
    </form>
  )
}
