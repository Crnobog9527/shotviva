'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'

import { Button } from '@/core/ui/button'

import type { OwnerConsole } from '../console/types'
import type { OwnerActions } from './actions'
import { FIELD, Result } from './parts'
import { useConsoleAction } from './use-console-action'

const digits = (raw: string) => raw.replace(/\D/g, '').slice(0, 10)

// 「默认月额度」 (ARCHITECTURE §6.5): one value per kind for every member without a personal setting,
// people who join later included. A personal value overrides it; 「恢复默认」 on a member goes back.
export function DefaultsForm({ data, actions }: { data: OwnerConsole; actions: OwnerActions }) {
  const t = useTranslations('app.org.defaults')
  const [paid, setPaidValue] = useState(String(data.org.defaultPaidAllowance))
  const [promo, setPromoValue] = useState(String(data.org.defaultPromoAllowance))
  const [requestId, setRequestId] = useState(() => crypto.randomUUID())
  // Changed values are a new request (a repeat of the same one stays idempotent).
  const setPaid = (next: string) => { setPaidValue(next); setRequestId(crypto.randomUUID()) }
  const setPromo = (next: string) => { setPromoValue(next); setRequestId(crypto.randomUUID()) }
  const { pending, outcome, run } = useConsoleAction()
  const suspended = data.org.status === 'suspended'
  const valid = paid !== '' && promo !== ''
  return (
    <form
      className="grid gap-2 rounded-md border border-hairline p-3"
      onSubmit={(event) => {
        event.preventDefault()
        if (pending || !valid || suspended) return
        run(() => actions.setDefaults({ requestId, paid: Number(paid), promo: Number(promo) }), t('saved'), () => setRequestId(crypto.randomUUID()))
      }}
    >
      <p className="font-medium">{t('title')}</p>
      <p className="text-caption text-muted-foreground">{t('hint')}</p>
      <div className="grid grid-cols-2 gap-3">
        <label className="grid gap-1 text-label"><span>{t('paid')}</span><input className={FIELD} inputMode="numeric" value={paid} onChange={(e) => setPaid(digits(e.target.value))} /></label>
        <label className="grid gap-1 text-label"><span>{t('promo')}</span><input className={FIELD} inputMode="numeric" value={promo} onChange={(e) => setPromo(digits(e.target.value))} /></label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="touch" variant="glass" disabled={pending || !valid || suspended}>{t('save')}</Button>
        <Result outcome={outcome} />
      </div>
    </form>
  )
}
