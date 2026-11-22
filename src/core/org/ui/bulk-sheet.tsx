'use client'

import { useState } from 'react'
import { useFormatter, useTranslations } from 'next-intl'

import { Button } from '@/core/ui/button'
import { ResponsiveSheet } from '@/core/ui/responsive-sheet'

import type { OwnerConsole } from '../console/types'
import type { OwnerActions } from './actions'
import { Confirm } from './confirm'
import { FIELD, Result } from './parts'
import { useConsoleAction } from './use-console-action'

// The amounts for a bulk action on the selected members (ARCHITECTURE §6.5 「默认额度与批量」): set
// the monthly allowance of either or both kinds (a number or "use default"), or give everyone the
// same one-off amount of one kind. One confirm shows what it takes from the pool; the request id
// stays until it succeeds, so a double click or a retry is one action.
type Setting = { mode: 'keep' | 'set' | 'default'; value: string }
type Props = { open: boolean; onOpenChange(open: boolean): void; members: string[]; data: OwnerConsole; actions: OwnerActions; onDone(): void }

const digits = (raw: string) => raw.replace(/\D/g, '').slice(0, 10)
const allowanceOf = (s: Setting) => (s.mode === 'keep' ? undefined : s.mode === 'default' ? ('default' as const) : Number(s.value))
const settingValid = (s: Setting) => s.mode !== 'set' || (s.value !== '' && Number.isInteger(Number(s.value)))

export function BulkSheet({ open, onOpenChange, members, data, actions, onDone }: Props) {
  const t = useTranslations('app.org.bulk')
  const [mode, setMode] = useState<'allowance' | 'grant'>('allowance')
  return (
    <ResponsiveSheet open={open} onOpenChange={onOpenChange} title={t('title', { count: members.length })} description={t('hint')}>
      <div className="grid gap-4 pb-2">
        <div role="radiogroup" aria-label={t('title', { count: members.length })} className="grid grid-cols-2 gap-2">
          {(['allowance', 'grant'] as const).map((m) => (
            <Button key={m} type="button" size="touch" variant={mode === m ? 'default' : 'glass'} role="radio" aria-checked={mode === m} onClick={() => setMode(m)}>{t(m)}</Button>
          ))}
        </div>
        {mode === 'allowance'
          ? <AllowanceForm members={members} actions={actions} onDone={onDone} />
          : <GrantForm members={members} data={data} actions={actions} onDone={onDone} />}
      </div>
    </ResponsiveSheet>
  )
}

function SettingField({ label, value, onChange }: { label: string; value: Setting; onChange(next: Setting): void }) {
  const t = useTranslations('app.org.bulk')
  return (
    <fieldset className="grid gap-2">
      <legend className="text-label font-medium">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {(['keep', 'set', 'default'] as const).map((m) => (
          <Button key={m} type="button" size="touch" variant={value.mode === m ? 'default' : 'glass'} aria-pressed={value.mode === m} onClick={() => onChange({ ...value, mode: m })}>{t(`setting.${m}`)}</Button>
        ))}
      </div>
      {value.mode === 'set' ? <input className={FIELD} inputMode="numeric" aria-label={label} value={value.value} onChange={(e) => onChange({ ...value, value: digits(e.target.value) })} /> : null}
    </fieldset>
  )
}

function AllowanceForm({ members, actions, onDone }: Pick<Props, 'members' | 'actions' | 'onDone'>) {
  const t = useTranslations('app.org.bulk')
  const [paid, setPaid] = useState<Setting>({ mode: 'keep', value: '' })
  const [promo, setPromo] = useState<Setting>({ mode: 'keep', value: '' })
  const [confirming, setConfirming] = useState(false)
  const [requestId, setRequestId] = useState(() => crypto.randomUUID())
  const { pending, outcome, run } = useConsoleAction()
  const valid = (paid.mode !== 'keep' || promo.mode !== 'keep') && settingValid(paid) && settingValid(promo)
  const send = () => run(
    () => actions.bulkSetAllowance({ requestId, members, paid: allowanceOf(paid), promo: allowanceOf(promo) }),
    t('saved', { count: members.length }),
    () => { setRequestId(crypto.randomUUID()); setConfirming(false); onDone() },
  )
  return (
    <div className="grid gap-4">
      <SettingField label={t('paidAllowance')} value={paid} onChange={setPaid} />
      <SettingField label={t('promoAllowance')} value={promo} onChange={setPromo} />
      <Button type="button" size="touch" disabled={!valid || pending} onClick={() => setConfirming(true)}>{t('apply')}</Button>
      <Result outcome={outcome} />
      <Confirm open={confirming} onOpenChange={setConfirming} title={t('confirmTitle', { count: members.length })} description={t('allowanceConfirm')}
        confirm={t('apply')} cancel={t('cancel')} busy={pending} onConfirm={send} />
    </div>
  )
}

function GrantForm({ members, data, actions, onDone }: Omit<Props, 'open' | 'onOpenChange'>) {
  const t = useTranslations('app.org.bulk')
  const format = useFormatter()
  const [kind, setKind] = useState<'paid' | 'promo'>('promo')
  const [each, setEach] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [requestId, setRequestId] = useState(() => crypto.randomUUID())
  const { pending, outcome, run } = useConsoleAction()
  const amount = Number(each)
  const total = amount * members.length
  const pool = kind === 'paid' ? data.org.poolCredits : data.org.promoPoolCredits
  const valid = Number.isInteger(amount) && amount > 0 && total <= pool
  const summary = t('total', { count: members.length, each: format.number(amount || 0), total: format.number(total), pool: format.number(pool), kind: t(`kind.${kind}`) })
  const send = () => run(
    () => actions.bulkGrant({ requestId, members, kind, each: amount }),
    t('given', { count: members.length, total: format.number(total) }),
    () => { setRequestId(crypto.randomUUID()); setConfirming(false); setEach(''); onDone() },
  )
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-2">
        {(['promo', 'paid'] as const).map((k) => (
          <Button key={k} type="button" size="touch" variant={kind === k ? 'default' : 'glass'} aria-pressed={kind === k} onClick={() => setKind(k)}>{t(`kind.${k}`)}</Button>
        ))}
      </div>
      <label className="grid gap-1 text-label">
        <span className="font-medium">{t('each')}</span>
        <input className={FIELD} inputMode="numeric" value={each} onChange={(e) => setEach(digits(e.target.value))} />
      </label>
      <p className="text-label tabular-nums">{summary}</p>
      {total > pool ? <p role="alert" className="text-label text-destructive">{t('short')}</p> : null}
      <Button type="button" size="touch" disabled={!valid || pending} onClick={() => setConfirming(true)}>{t('give')}</Button>
      <Result outcome={outcome} />
      <Confirm open={confirming} onOpenChange={setConfirming} title={t('confirmTitle', { count: members.length })} description={summary}
        confirm={t('give')} cancel={t('cancel')} busy={pending} onConfirm={send} />
    </div>
  )
}
