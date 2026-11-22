'use client'

import { useState } from 'react'
import { useFormatter, useTranslations } from 'next-intl'

import { Button } from '@/core/ui/button'
import { Checkbox } from '@/core/ui/checkbox'

import type { ConsoleMember, OwnerConsole } from '../console/types'
import type { OwnerActions } from './actions'
import { BulkBar, BulkToolbar } from './bulk-toolbar'
import { Confirm } from './confirm'
import { DefaultsForm } from './defaults-panel'
import { useMemberSelection } from './member-selection'
import { FIELD, Panel, Result } from './parts'
import { useConsoleAction } from './use-console-action'

const digits = (raw: string) => raw.replace(/\D/g, '').slice(0, 10)

type RowProps = { member: ConsoleMember; actions: OwnerActions; suspended: boolean; label: string }
// Paid credits (pool_credits) or promotion credits (promo pool: watermarked, expire at month end).
type Kind = 'paid' | 'promo'
type FormProps = RowProps & { kind: Kind }

function AllowanceForm({ member, actions, suspended, label, kind }: FormProps) {
  const t = useTranslations('app.org.members')
  const [allowance, setAllowance] = useState(String(kind === 'paid' ? member.monthlyAllowance : member.promoAllowance))
  const { pending, outcome, run } = useConsoleAction()
  const value = Number(allowance)
  const valid = allowance !== '' && Number.isInteger(value) && value >= 0
  return (
    <form
      className="grid gap-1"
      onSubmit={(event) => {
        event.preventDefault()
        if (pending || !valid || suspended) return
        const save = kind === 'paid' ? actions.setAllowance : actions.setPromoAllowance
        run(() => save({ member: member.userId, allowance: value }), t('allowanceSaved'))
      }}
    >
      <label className="grid gap-1 text-label">
        <span className="font-medium">{t(kind === 'paid' ? 'allowance' : 'promoAllowance')}{follows(member, kind) ? <span className="ml-2 text-caption font-normal text-muted-foreground">{t('isDefault')}</span> : null}</span>
        <span className="flex gap-2">
          <input className={FIELD} inputMode="numeric" aria-label={t(kind === 'paid' ? 'allowanceFor' : 'promoAllowanceFor', { who: label })} value={allowance} onChange={(e) => setAllowance(digits(e.target.value))} />
          <Button type="submit" size="touch" variant="glass" disabled={pending || !valid || suspended}>{t('save')}</Button>
        </span>
      </label>
      <Result outcome={outcome} />
      {follows(member, kind) ? null : <UseDefault member={member} actions={actions} kind={kind} suspended={suspended} />}
    </form>
  )
}

const follows = (member: ConsoleMember, kind: Kind) => (kind === 'paid' ? member.paidFollowsDefault : member.promoFollowsDefault)

// 「恢复默认」: this member's allowance of this kind follows the org default again (a one-member bulk set).
function UseDefault({ member, actions, kind, suspended }: Pick<FormProps, 'member' | 'actions' | 'kind' | 'suspended'>) {
  const t = useTranslations('app.org.members')
  const [requestId, setRequestId] = useState(() => crypto.randomUUID())
  const { pending, outcome, run } = useConsoleAction()
  const reset = () => run(() => actions.bulkSetAllowance({ requestId, members: [member.userId], [kind]: 'default' }), t('defaultRestored'), () => setRequestId(crypto.randomUUID()))
  return (
    <span className="flex flex-wrap items-center gap-2">
      <Button type="button" size="touch" variant="ghost" disabled={pending || suspended} onClick={reset}>{t('useDefault')}</Button>
      <Result outcome={outcome} />
    </span>
  )
}

// "Give now": one request id per form, kept until it succeeds, so a double click or a retry after
// a lost answer is the same request to the database.
function GiveForm({ member, actions, suspended, label, kind }: FormProps) {
  const t = useTranslations('app.org.members')
  const format = useFormatter()
  const [give, setGive] = useState('')
  const [requestId, setRequestId] = useState(() => crypto.randomUUID())
  const { pending, outcome, run } = useConsoleAction()
  const value = Number(give)
  const valid = Number.isInteger(value) && value > 0
  return (
    <form
      className="grid gap-1"
      onSubmit={(event) => {
        event.preventDefault()
        if (pending || !valid || suspended) return
        const allocate = kind === 'paid' ? actions.allocate : actions.allocatePromo
        run(() => allocate({ requestId, member: member.userId, credits: value }), t('given', { count: value }), () => { setRequestId(crypto.randomUUID()); setGive('') })
      }}
    >
      <label className="grid gap-1 text-label">
        <span className="font-medium">{t(kind === 'paid' ? 'giveNow' : 'promoGiveNow')}</span>
        <span className="flex gap-2">
          <input className={FIELD} inputMode="numeric" aria-label={t(kind === 'paid' ? 'giveFor' : 'promoGiveFor', { who: label })} value={give}
            placeholder={format.number(kind === 'paid' ? member.monthlyAllowance : member.promoAllowance)} onChange={(e) => setGive(digits(e.target.value))} />
          <Button type="submit" size="touch" variant="glass" disabled={pending || !valid || suspended}>{pending ? t('giving') : t('give')}</Button>
        </span>
      </label>
      <Result outcome={outcome} />
    </form>
  )
}

function RemoveControl({ member, actions, label }: Omit<RowProps, 'suspended'>) {
  const t = useTranslations('app.org.members')
  const [requestId, setRequestId] = useState(() => crypto.randomUUID())
  const [open, setOpen] = useState(false)
  const { pending, outcome, run } = useConsoleAction()
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button type="button" size="touch" variant="glass" disabled={pending} onClick={() => setOpen(true)}>{t('remove')}</Button>
      <Result outcome={outcome} />
      <Confirm
        open={open}
        onOpenChange={setOpen}
        title={t('removeTitle', { who: label })}
        description={t('removeBody')}
        confirm={t('removeConfirm')}
        cancel={t('cancel')}
        busy={pending}
        onConfirm={() => run(
          () => actions.removeMember({ requestId, member: member.userId }),
          t('removed'),
          () => { setRequestId(crypto.randomUUID()); setOpen(false) },
        )}
      />
    </div>
  )
}

// One pool's allowance and "give now" for one person, under that pool's name.
function KindForms(props: FormProps) {
  const t = useTranslations('app.org.members')
  return (
    <fieldset className="grid gap-3 sm:grid-cols-2">
      <legend className="mb-1 text-caption font-medium text-muted-foreground">{t(props.kind === 'paid' ? 'paidKind' : 'promoKind')}</legend>
      {/* Keyed by the value in force, so 恢复默认 or a new org default refreshes the field. */}
      <AllowanceForm key={`${props.kind}:${props.kind === 'paid' ? props.member.monthlyAllowance : props.member.promoAllowance}:${follows(props.member, props.kind)}`} {...props} />
      <GiveForm {...props} />
    </fieldset>
  )
}

// One person: what they hold, their monthly allowance, "give now", and removal.
type MemberRowProps = { member: ConsoleMember; actions: OwnerActions; suspended: boolean; pick: { checked: boolean; toggle(): void } | null }

function MemberRow({ member, actions, suspended, pick }: MemberRowProps) {
  const t = useTranslations('app.org.members')
  const label = member.account ?? t('unknown')
  const props = { member, actions, suspended, label }
  return (
    <li className="space-y-3 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        {pick ? <Checkbox checked={pick.checked} onCheckedChange={pick.toggle} aria-label={t('pick', { who: label })} className="size-5 self-center" /> : null}
        <p className="min-w-0 flex-1 break-all font-medium">{label}{member.role === 'owner' ? <span className="ml-2 rounded-full bg-wash px-2 py-0.5 text-caption font-normal">{t('owner')}</span> : null}</p>
        <p className="text-caption text-muted-foreground tabular-nums">
          {t('held', { count: member.heldCredits })} · {t('heldPromo', { count: member.heldPromoCredits })} · {t('customers', { count: member.customers })}
        </p>
      </div>
      {pick ? null : <>
        <KindForms {...props} kind="paid" />
        <KindForms {...props} kind="promo" />
        {member.role === 'owner' ? null : <RemoveControl {...props} />}
      </>}
    </li>
  )
}

export function MembersPanel({ data, actions }: { data: OwnerConsole; actions: OwnerActions }) {
  const t = useTranslations('app.org.members')
  const suspended = data.org.status === 'suspended'
  const selection = useMemberSelection(data.members)
  return (
    <Panel title={t('title')} hint={t('hint')}>
      <DefaultsForm data={data} actions={actions} />
      <BulkToolbar selection={selection} disabled={suspended} />
      <ul className="divide-y divide-hairline">
        {selection.shown.map((member) => (
          <MemberRow key={member.userId} member={member} actions={actions} suspended={suspended}
            pick={selection.selecting ? { checked: selection.selected.includes(member.userId), toggle: () => selection.toggle(member.userId) } : null} />
        ))}
      </ul>
      <BulkBar selection={selection} data={data} actions={actions} />
      {data.memberTotal > data.members.length ? <p className="text-caption text-muted-foreground">{t('truncated', { shown: data.members.length, total: data.memberTotal })}</p> : null}
      {data.members.length <= 1 ? <p className="text-label text-muted-foreground">{t('inviteEmpty')}</p> : null}
    </Panel>
  )
}
