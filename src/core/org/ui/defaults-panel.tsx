'use client'

import { useState } from 'react'
import { useFormatter, useTranslations } from 'next-intl'

import { Button } from '@/core/ui/button'

import type { OwnerConsole } from '../console/types'
import type { OwnerActions } from './actions'
import { Confirm } from './confirm'
import { FIELD, Result } from './parts'
import { useConsoleAction } from './use-console-action'

const digits = (raw: string) => raw.replace(/\D/g, '').slice(0, 10)

// What a new default touches, for the confirm: members who follow it, how many of those had 0 /
// nothing set (they start receiving it), and the most a promotion default can hand out at once.
export function defaultsImpact(data: OwnerConsole, change: { paid?: number; promo?: number }) {
  const members = data.members
  const followers = (kind: 'paid' | 'promo') => members.filter((m) => (kind === 'paid' ? m.paidFollowsDefault : m.promoFollowsDefault))
  const unset = (kind: 'paid' | 'promo') => followers(kind).filter((m) => (kind === 'paid' ? m.paidUnset : m.promoUnset)).length
  const promoFollowers = followers('promo').length
  return {
    paid: change.paid === undefined ? null : { followers: followers('paid').length, unset: unset('paid') },
    promo: change.promo === undefined ? null : { followers: promoFollowers, unset: unset('promo'), maxDraw: Math.min(change.promo * promoFollowers, data.org.promoPoolCredits) },
  }
}

// Only the kinds whose value differs from what is saved.
function changedDefaults(data: OwnerConsole, paid: string, promo: string): { paid?: number; promo?: number } {
  return {
    ...(paid !== '' && Number(paid) !== data.org.defaultPaidAllowance ? { paid: Number(paid) } : {}),
    ...(promo !== '' && Number(promo) !== data.org.defaultPromoAllowance ? { promo: Number(promo) } : {}),
  }
}

function confirmLines(data: OwnerConsole, change: { paid?: number; promo?: number }, t: ReturnType<typeof useTranslations>, format: ReturnType<typeof useFormatter>) {
  const impact = defaultsImpact(data, change)
  return [
    impact.paid ? t('confirmPaid', { followers: impact.paid.followers, unset: impact.paid.unset, value: format.number(change.paid ?? 0) }) : null,
    impact.promo ? t('confirmPromo', { followers: impact.promo.followers, unset: impact.promo.unset, value: format.number(change.promo ?? 0), max: format.number(impact.promo.maxDraw) }) : null,
    t('confirmPin'),
  ].filter(Boolean).join(' ')
}

// 「默认月额度」 (ARCHITECTURE §6.5): one value per kind for every member without a personal setting,
// people who join later included. Only the kinds that changed are sent, after a confirm that says
// whom it reaches and what a promotion default takes from the pool now.
export function DefaultsForm({ data, actions }: { data: OwnerConsole; actions: OwnerActions }) {
  const t = useTranslations('app.org.defaults')
  const format = useFormatter()
  const [paid, setPaidValue] = useState(String(data.org.defaultPaidAllowance))
  const [promo, setPromoValue] = useState(String(data.org.defaultPromoAllowance))
  const [requestId, setRequestId] = useState(() => crypto.randomUUID())
  const [confirming, setConfirming] = useState(false)
  const { pending, outcome, run } = useConsoleAction()
  // Changed values are a new request (a repeat of the same one stays idempotent).
  const setPaid = (next: string) => { setPaidValue(next); setRequestId(crypto.randomUUID()) }
  const setPromo = (next: string) => { setPromoValue(next); setRequestId(crypto.randomUUID()) }
  const change = changedDefaults(data, paid, promo)
  const changed = change.paid !== undefined || change.promo !== undefined
  const suspended = data.org.status === 'suspended'
  const lines = confirmLines(data, change, t, format)
  return (
    <form
      className="grid gap-2 rounded-md border border-hairline p-3"
      onSubmit={(event) => {
        event.preventDefault()
        if (pending || !changed || suspended) return
        setConfirming(true)
      }}
    >
      <p className="font-medium">{t('title')}</p>
      <p className="text-caption text-muted-foreground">{t('hint')}</p>
      <div className="grid grid-cols-2 gap-3">
        <label className="grid gap-1 text-label"><span>{t('paid')}</span><input className={FIELD} inputMode="numeric" value={paid} onChange={(e) => setPaid(digits(e.target.value))} /></label>
        <label className="grid gap-1 text-label"><span>{t('promo')}</span><input className={FIELD} inputMode="numeric" value={promo} onChange={(e) => setPromo(digits(e.target.value))} /></label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="touch" variant="glass" disabled={pending || !changed || suspended}>{t('save')}</Button>
        <Result outcome={outcome} />
      </div>
      <Confirm open={confirming} onOpenChange={setConfirming} title={t('confirmTitle')} description={lines} confirm={t('save')} cancel={t('cancel')} busy={pending}
        onConfirm={() => run(() => actions.setDefaults({ requestId, ...change }), t('saved'), () => { setRequestId(crypto.randomUUID()); setConfirming(false) })} />
    </form>
  )
}
