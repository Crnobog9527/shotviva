'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'

import { Button } from '@/core/ui/button'
import { Checkbox } from '@/core/ui/checkbox'

import type { ConsoleMember, OwnerConsole } from '../console/types'
import type { OwnerActions } from './actions'
import { BulkBar, BulkToolbar } from './bulk-toolbar'
import { Confirm } from './confirm'
import { DefaultsForm } from './defaults-panel'
import { KeptContext, createKept, newRequestId, useKeptState, type Kept } from './kept-state'
import { PAGE_SIZE, useMemberSelection } from './member-selection'
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
  const [requestId, setRequestId] = useKeptState(`${member.userId}:${kind}:default:id`, newRequestId)
  const { pending, outcome, run } = useConsoleAction()
  const reset = () => run(() => actions.bulkSetAllowance({ requestId, members: [member.userId], [kind]: 'default' }), t('defaultRestored'), () => setRequestId(newRequestId()))
  return (
    <span className="flex flex-wrap items-center gap-2">
      <Button type="button" size="touch" variant="ghost" disabled={pending || suspended} onClick={reset}>{t('useDefault')}</Button>
      <Result outcome={outcome} />
    </span>
  )
}

// "Top up manually": one request id per form, kept until it succeeds, so a double click or a retry after
// a lost answer is the same request to the database.
function GiveForm({ member, actions, suspended, label, kind }: FormProps) {
  const t = useTranslations('app.org.members')
  const format = useFormatter()
  const [give, setGive] = useKeptState(`${member.userId}:${kind}:give:amount`, () => '')
  const [requestId, setRequestId] = useKeptState(`${member.userId}:${kind}:give:id`, newRequestId)
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
        run(() => allocate({ requestId, member: member.userId, credits: value }), t('given', { count: value }), () => { setRequestId(newRequestId()); setGive('') })
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
  const [requestId, setRequestId] = useKeptState(`${member.userId}:remove:id`, newRequestId)
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
          () => { setRequestId(newRequestId()); setOpen(false) },
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

// One person: a compact row (account, role, what they hold, customers); tapping it opens the editor
// (allowances, "top up manually", removal) in place.
type MemberRowProps = { member: ConsoleMember; actions: OwnerActions; suspended: boolean; pick: { checked: boolean; toggle(): void } | null; open: boolean; onToggle(): void }

function MemberSummary({ member, label }: { member: ConsoleMember; label: string }) {
  const t = useTranslations('app.org.members')
  return (
    <>
      <span className="flex min-w-0 items-center gap-2">
        <span className="min-w-0 break-all font-medium">{label}</span>
        {member.role === 'owner' ? <span className="shrink-0 rounded-full border border-hairline bg-card px-2 py-0.5 text-caption font-normal">{t('owner')}</span> : null}
      </span>
      <span className="flex flex-wrap gap-x-2 text-caption text-muted-foreground tabular-nums">
        <span className="whitespace-nowrap">{t('held', { count: member.heldCredits })}</span>
        <span className="whitespace-nowrap">{t('heldPromo', { count: member.heldPromoCredits })}</span>
        <span className="whitespace-nowrap">{t('customers', { count: member.customers })}</span>
      </span>
    </>
  )
}

function Chevron({ show, open }: { show: boolean; open: boolean }) {
  return show ? <ChevronDown aria-hidden className={`size-4 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} /> : null
}

function MemberEditor({ id, hidden, ...props }: RowProps & { id: string; hidden: boolean }) {
  return (
    <div id={id} hidden={hidden} className="space-y-3 pb-4 pt-2">
      <KindForms {...props} kind="paid" />
      <KindForms {...props} kind="promo" />
      {props.member.role === 'owner' ? null : <RemoveControl {...props} />}
    </div>
  )
}

function MemberRow({ member, actions, suspended, pick, open, onToggle }: MemberRowProps) {
  const t = useTranslations('app.org.members')
  const label = member.account ?? t('unknown')
  const panelId = `member-editor-${member.userId}`
  // Once opened, the editor stays mounted (hidden when closed) so a request id, a typed amount or an
  // answer still on its way survives collapsing the row: a retry is the same request.
  const [opened, setOpened] = useState(open)
  if (open && !opened) setOpened(true)
  // An editor opened near the bottom of the scrolling list is brought into view.
  const rowRef = useRef<HTMLLIElement>(null)
  useEffect(() => { if (open) rowRef.current?.scrollIntoView?.({ block: 'nearest' }) }, [open])
  return (
    <li ref={rowRef} className={`scroll-my-2 px-3 py-1 ${open ? 'bg-card shadow-[inset_3px_0_0_var(--color-primary)]' : ''}`}>
      <div className="flex items-center gap-3">
        {pick ? <Checkbox checked={pick.checked} onCheckedChange={pick.toggle} aria-label={t('pick', { who: label })} className="size-5 shrink-0" /> : null}
        {pick ? (
          <div className="grid min-h-14 min-w-0 flex-1 content-center gap-0.5"><MemberSummary member={member} label={label} /></div>
        ) : (
          <button type="button" aria-expanded={open} aria-controls={opened ? panelId : undefined} onClick={onToggle}
            className="grid min-h-14 min-w-0 flex-1 content-center gap-0.5 text-left">
            <MemberSummary member={member} label={label} />
          </button>
        )}
        <Chevron show={!pick} open={open} />
      </div>
      {!pick && opened ? <MemberEditor id={panelId} hidden={!open} member={member} actions={actions} suspended={suspended} label={label} /> : null}
    </li>
  )
}

// `initialOpen`: the member whose editor starts open (the rows start collapsed otherwise).
export function MembersPanel({ data, actions, initialOpen = null }: { data: OwnerConsole; actions: OwnerActions; initialOpen?: string | null }) {
  const t = useTranslations('app.org.members')
  const suspended = data.org.status === 'suspended'
  const selection = useMemberSelection(data.members, initialOpen)
  // Request ids and typed amounts outlive the rows (filter, paging and selection mode unmount them).
  const [kept] = useState<Kept>(createKept)
  return (
    <KeptContext.Provider value={kept}>
    <Panel title={t('title')} hint={t('hint')}>
      <DefaultsForm data={data} actions={actions} />
      <BulkToolbar selection={selection} disabled={suspended} />
      <section aria-label={t('listTitle', { count: data.memberTotal })} className="overflow-hidden rounded-xl border border-hairline bg-wash">
        <h3 className="border-b border-hairline px-3 py-2 text-label font-medium">{t('listTitle', { count: data.memberTotal })}</h3>
        <ul className="max-h-[60vh] divide-y divide-hairline overflow-y-auto overscroll-contain sm:max-h-[28rem]">
          {selection.visible.map((member) => (
            <MemberRow key={member.userId} member={member} actions={actions} suspended={suspended}
              open={selection.open === member.userId} onToggle={() => selection.toggleOpen(member.userId)}
              pick={selection.selecting ? { checked: selection.selected.includes(member.userId), toggle: () => selection.toggle(member.userId) } : null} />
          ))}
        </ul>
        {selection.shown.length === 0 && data.members.length > 0 ? <p className="px-3 py-3 text-label text-muted-foreground">{t('noMatch')}</p> : null}
        {data.members.length <= 1 ? <p className="border-t border-hairline px-3 py-3 text-label text-muted-foreground">{t('inviteEmpty')}</p> : null}
      </section>
      {selection.hidden > 0 ? (
        <Button type="button" size="touch" variant="glass" onClick={selection.showMore}>
          {t('showMore', { count: Math.min(PAGE_SIZE, selection.hidden), shown: selection.visible.length, total: selection.shown.length })}
        </Button>
      ) : null}
      <BulkBar selection={selection} data={data} actions={actions} />
      {data.memberTotal > data.members.length ? <p className="text-caption text-muted-foreground">{t('truncated', { shown: data.members.length, total: data.memberTotal })}</p> : null}
    </Panel>
    </KeptContext.Provider>
  )
}
