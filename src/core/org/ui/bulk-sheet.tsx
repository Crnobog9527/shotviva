'use client'

import { useState } from 'react'
import { useFormatter, useTranslations } from 'next-intl'

import { Button } from '@/core/ui/button'
import { ResponsiveSheet } from '@/core/ui/responsive-sheet'

import type { OwnerConsole } from '../console/types'
import type { OwnerActions } from './actions'
import { blankAllowance, blankGrant, draftFor, membersKey, type AllowanceDraft, type GrantDraft, type Setting } from './bulk-drafts'
import { newRequestId, useKeptState } from './kept-state'
import { FIELD, Result } from './parts'
import { useConsoleAction } from './use-console-action'

// The amounts for a bulk action on the selected members (ARCHITECTURE §6.5 「默认额度与批量」): set
// the monthly allowance of either or both kinds (a number or "use default"), or give everyone the
// same one-off amount of one kind. One confirm shows what it takes from the pool; the request id
// stays until it succeeds, so a double click or a retry is one action.
type Props = { open: boolean; onOpenChange(open: boolean): void; members: string[]; data: OwnerConsole; actions: OwnerActions; onDone(): void }

const digits = (raw: string) => raw.replace(/\D/g, '').slice(0, 10)
const allowanceOf = (s: Setting) => (s.mode === 'keep' ? undefined : s.mode === 'default' ? ('default' as const) : Number(s.value))
const poolOf = (kind: 'paid' | 'promo', paid: number, promo: number) => (kind === 'paid' ? paid : promo)
// The pool to show (the fresh read once there is one) and whether that read says it is short.
const poolView = (fresh: number | null, page: number, total: number) => ({ pool: fresh ?? page, short: fresh !== null && total > fresh })
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
  const key = membersKey(members)
  const [stored, setDraft] = useKeptState<AllowanceDraft>('bulk:allowance', () => blankAllowance(key, newRequestId))
  const { requestId, paid, promo } = draftFor(stored, key, () => blankAllowance(key, newRequestId))
  const [confirming, setConfirming] = useState(false)
  // A changed form is a new request: only a repeat of the same one may be answered 'already'.
  const setPaid = (next: Setting) => setDraft({ members: key, requestId: newRequestId(), paid: next, promo })
  const setPromo = (next: Setting) => setDraft({ members: key, requestId: newRequestId(), paid, promo: next })
  const { pending, outcome, run } = useConsoleAction()
  const valid = (paid.mode !== 'keep' || promo.mode !== 'keep') && settingValid(paid) && settingValid(promo)
  const send = () => run(
    () => actions.bulkSetAllowance({ requestId, members, paid: allowanceOf(paid), promo: allowanceOf(promo) }),
    t('saved', { count: members.length }),
    () => { setDraft(blankAllowance(key, newRequestId)); setConfirming(false); onDone() },
  )
  return (
    <div className="grid gap-4">
      <SettingField label={t('paidAllowance')} value={paid} onChange={setPaid} />
      <SettingField label={t('promoAllowance')} value={promo} onChange={setPromo} />
      <Button type="button" size="touch" disabled={!valid || pending} onClick={() => setConfirming(true)}>{t('apply')}</Button>
      <Result outcome={outcome} />
      {confirming ? <InlineConfirm title={t('confirmTitle', { count: members.length })} description={t('allowanceConfirm')}
        confirm={t('apply')} cancel={t('cancel')} busy={pending} onConfirm={send} onCancel={() => setConfirming(false)} /> : null}
    </div>
  )
}

function GrantForm({ members, data, actions, onDone }: Omit<Props, 'open' | 'onOpenChange'>) {
  const t = useTranslations('app.org.bulk')
  const format = useFormatter()
  const key = membersKey(members)
  const [stored, setDraft] = useKeptState<GrantDraft>('bulk:grant', () => blankGrant(key, newRequestId))
  const { requestId, kind, each } = draftFor(stored, key, () => blankGrant(key, newRequestId))
  const [confirming, setConfirming] = useState(false)
  // The pool as read just now (null until "Give" reads it): the page's number may be stale either
  // way (a promotion top-up is handed out at once to members on the default; deposits and grants
  // raise it), so only this read decides whether the confirm opens or the short warning shows.
  const [fresh, setFresh] = useState<number | null>(null)
  // A changed kind or amount is a new request, and needs a new read before it can be confirmed.
  const edit = (patch: Partial<Pick<GrantDraft, 'kind' | 'each'>>) => { setDraft({ members: key, requestId: newRequestId(), kind, each, ...patch }); setConfirming(false); setFresh(null) }
  const setKind = (next: 'paid' | 'promo') => edit({ kind: next })
  const setEach = (next: string) => edit({ each: next })
  const { pending, outcome, run } = useConsoleAction()
  const check = useConsoleAction()
  const amount = Number(each)
  const total = amount * members.length
  const { pool, short } = poolView(fresh, poolOf(kind, data.org.poolCredits, data.org.promoPoolCredits), total)
  const valid = Number.isInteger(amount) && amount > 0
  const summary = t('total', { count: members.length, each: format.number(amount || 0), total: format.number(total), pool: format.number(pool), kind: t(`kind.${kind}`) })
  const review = () => check.run(() => actions.pools(), '', (now) => {
    check.clear()
    const left = poolOf(kind, now.pool, now.promoPool)
    setFresh(left)
    setConfirming(total <= left)
  })
  // A refused give (the pool shrank meanwhile) closes the confirm; the next "Give" reads again.
  const send = () => run(
    () => actions.bulkGrant({ requestId, members, kind, each: amount }),
    t('given', { count: members.length, total: format.number(total) }),
    () => { setDraft(blankGrant(key, newRequestId)); setConfirming(false); setFresh(null); onDone() },
    () => { setConfirming(false); setFresh(null) },
  )
  const busy = pending || check.pending
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
      {short ? <p role="alert" className="text-label text-destructive">{t('short', { pool: format.number(pool), kind: t(`kind.${kind}`) })}</p> : null}
      <Button type="button" size="touch" disabled={!valid || busy} onClick={review}>{t('give')}</Button>
      <Result outcome={check.outcome ?? outcome} />
      {confirming && !short ? <InlineConfirm title={t('confirmTitle', { count: members.length })} description={summary}
        confirm={t('give')} cancel={t('cancel')} busy={pending} onConfirm={send} onCancel={() => setConfirming(false)} /> : null}
    </div>
  )
}

// The confirm step inside the sheet itself: a dialog opened from the sheet would sit under it
// (the sheet is a higher layer), so the last step stays in the same layer, in place of the action.
type InlineConfirmProps = { title: string; description: string; confirm: string; cancel: string; busy: boolean; onConfirm(): void; onCancel(): void }

function InlineConfirm({ title, description, confirm, cancel, busy, onConfirm, onCancel }: InlineConfirmProps) {
  return (
    <div role="alertdialog" aria-label={title} className="grid gap-3 rounded-md border border-primary/40 bg-primary/5 p-3">
      <p className="font-medium">{title}</p>
      <p className="text-label tabular-nums">{description}</p>
      <div className="flex gap-2">
        <Button type="button" size="touch" variant="glass" disabled={busy} onClick={onCancel}>{cancel}</Button>
        <Button type="button" size="touch" disabled={busy} onClick={onConfirm}>{confirm}</Button>
      </div>
    </div>
  )
}
