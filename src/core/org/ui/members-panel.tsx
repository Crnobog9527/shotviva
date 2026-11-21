'use client'

import { useState } from 'react'
import { useFormatter, useTranslations } from 'next-intl'

import { Button } from '@/core/ui/button'

import type { ConsoleMember, OwnerConsole } from '../console/types'
import type { OwnerActions } from './actions'
import { Confirm } from './confirm'
import { FIELD, Panel, Result } from './parts'
import { useConsoleAction } from './use-console-action'

const digits = (raw: string) => raw.replace(/\D/g, '').slice(0, 10)

type RowProps = { member: ConsoleMember; actions: OwnerActions; suspended: boolean; label: string }

function AllowanceForm({ member, actions, suspended, label }: RowProps) {
  const t = useTranslations('app.org.members')
  const [allowance, setAllowance] = useState(String(member.monthlyAllowance))
  const { pending, outcome, run } = useConsoleAction()
  const value = Number(allowance)
  const valid = allowance !== '' && Number.isInteger(value) && value >= 0
  return (
    <form
      className="grid gap-1"
      onSubmit={(event) => {
        event.preventDefault()
        if (pending || !valid || suspended) return
        run(() => actions.setAllowance({ member: member.userId, allowance: value }), t('allowanceSaved'))
      }}
    >
      <label className="grid gap-1 text-label">
        <span className="font-medium">{t('allowance')}</span>
        <span className="flex gap-2">
          <input className={FIELD} inputMode="numeric" aria-label={t('allowanceFor', { who: label })} value={allowance} onChange={(e) => setAllowance(digits(e.target.value))} />
          <Button type="submit" size="touch" variant="glass" disabled={pending || !valid || suspended}>{t('save')}</Button>
        </span>
      </label>
      <Result outcome={outcome} />
    </form>
  )
}

// "Give now": one request id per form, kept until it succeeds, so a double click or a retry after
// a lost answer is the same request to the database.
function GiveForm({ member, actions, suspended, label }: RowProps) {
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
        run(() => actions.allocate({ requestId, member: member.userId, credits: value }), t('given', { count: value }), () => { setRequestId(crypto.randomUUID()); setGive('') })
      }}
    >
      <label className="grid gap-1 text-label">
        <span className="font-medium">{t('giveNow')}</span>
        <span className="flex gap-2">
          <input className={FIELD} inputMode="numeric" aria-label={t('giveFor', { who: label })} value={give} placeholder={format.number(member.monthlyAllowance)} onChange={(e) => setGive(digits(e.target.value))} />
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

// One person: what they hold, their monthly allowance, "give now", and removal.
function MemberRow({ member, actions, suspended }: { member: ConsoleMember; actions: OwnerActions; suspended: boolean }) {
  const t = useTranslations('app.org.members')
  const label = member.account ?? t('unknown')
  const props = { member, actions, suspended, label }
  return (
    <li className="space-y-3 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="min-w-0 break-all font-medium">{label}{member.role === 'owner' ? <span className="ml-2 rounded-full bg-wash px-2 py-0.5 text-caption font-normal">{t('owner')}</span> : null}</p>
        <p className="text-caption text-muted-foreground tabular-nums">{t('held', { count: member.heldCredits })} · {t('customers', { count: member.customers })}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <AllowanceForm {...props} />
        <GiveForm {...props} />
      </div>
      {member.role === 'owner' ? null : <RemoveControl {...props} />}
    </li>
  )
}

export function MembersPanel({ data, actions }: { data: OwnerConsole; actions: OwnerActions }) {
  const t = useTranslations('app.org.members')
  const suspended = data.org.status === 'suspended'
  return (
    <Panel title={t('title')} hint={t('hint')}>
      <ul className="divide-y divide-hairline">
        {data.members.map((member) => <MemberRow key={member.userId} member={member} actions={actions} suspended={suspended} />)}
      </ul>
      {data.memberTotal > data.members.length ? <p className="text-caption text-muted-foreground">{t('truncated', { shown: data.members.length, total: data.memberTotal })}</p> : null}
      {data.members.length <= 1 ? <p className="text-label text-muted-foreground">{t('inviteEmpty')}</p> : null}
    </Panel>
  )
}

// E5 ships the read function behind the monthly table and its CSV; until it is on main this is
// the marked place for it (card E4: no SQL of its own).
export function PerformanceSlot() {
  const t = useTranslations('app.org.performance')
  return (
    <Panel title={t('title')} hint={t('hint')}>
      <p data-slot="org-performance-pending" className="text-label text-muted-foreground">{t('pending')}</p>
    </Panel>
  )
}
