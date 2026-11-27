'use client'

import { useEffect, useRef, useState } from 'react'

import { Button } from '@/core/ui/button'
import { cn } from '@/core/ui/cn'
import { DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/core/ui/dialog'
import { Input } from '@/core/ui/input'
import { Textarea } from '@/core/ui/textarea'

import type { ActionValue } from '../templates/types'
import { BACKDATE_MAX_DAYS, type BindInput, type PartnerOption } from '../users/bind-partner-types'
import type { UserReferrer } from '../users/list-types'
import { USERS_COPY } from './copy'

const COPY = USERS_COPY.bind
const SOURCES = USERS_COPY.referral.sources

export type SearchPartners = (input: { query: string }) => Promise<ActionValue<PartnerOption[]>>

type Props = {
  // The account being bound, when the dialog was not opened from its own detail.
  customer?: string
  // The account's current binding (null: none; undefined: still reading).
  current: UserReferrer | null | undefined
  // A fixed partner (an org's 推广名单) or a search to pick one (the user detail).
  partner: PartnerOption | null
  search?: SearchPartners
  pending: boolean
  error: string | null
  onCancel: () => void
  onConfirm: (input: Omit<BindInput, 'userId'>) => void
}

// Back-dating is off by default; when on, 1..BACKDATE_MAX_DAYS days.
function useBackdate() {
  const [on, setOn] = useState(false)
  const [days, setDays] = useState('30')
  const n = Number(days)
  const ok = !on || (Number.isInteger(n) && n >= 1 && n <= BACKDATE_MAX_DAYS)
  return { on, setOn, days, setDays, ok, value: on && ok ? n : 0 }
}

// 绑定渠道 (2029): pick the partner, see the current binding, optionally back-date commissions for
// the last N days, give the reason, confirm.
export function BindPartnerDialog({ customer, current, partner: fixed, search, pending, error, onCancel, onConfirm }: Props) {
  const [picked, setPicked] = useState<PartnerOption | null>(fixed)
  const [reason, setReason] = useState('')
  const backdate = useBackdate()
  const choice = ready(current, picked, reason, backdate.ok)
  const confirm = () => { if (choice) onConfirm({ partnerId: choice.id, reason: reason.trim(), backdateDays: backdate.value }) }
  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{COPY.title}</DialogTitle>
        <DialogDescription>{COPY.body}</DialogDescription>
      </DialogHeader>
      <div className="grid gap-3 text-sm">
        <Who customer={customer} current={current} />
        <PartnerField picked={picked} fixed={fixed !== null} search={search} onPick={setPicked} />
        <SameNote same={picked !== null && current?.partnerId === picked.id} />
        <BackdateFields state={backdate} />
        <label className="grid gap-1">
          <span className="font-medium">{COPY.reason}</span>
          <Textarea rows={2} maxLength={2000} value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
      </div>
      <ErrorLine error={error} />
      <DialogFooter>
        <Button variant="outline" onClick={onCancel} disabled={pending}>{COPY.cancel}</Button>
        <Button disabled={pending || !choice} onClick={confirm}>
          {choice ? COPY.confirm(choice.name, backdate.value) : COPY.open}
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}

// The partner to bind when everything needed is there, else null.
function ready(current: UserReferrer | null | undefined, picked: PartnerOption | null, reason: string, daysOk: boolean): PartnerOption | null {
  if (current === undefined || picked?.status !== 'active' || reason.trim().length === 0 || !daysOk) return null
  return picked
}

function Who({ customer, current }: { customer?: string; current: UserReferrer | null | undefined }) {
  return (
    <>
      {customer ? <p className="font-medium break-all">{customer}</p> : null}
      <CurrentBinding current={current} />
    </>
  )
}

function SameNote({ same }: { same: boolean }) {
  return same ? <p className="text-muted-foreground">{COPY.same}</p> : null
}

function ErrorLine({ error }: { error: string | null }) {
  return error ? <p className="text-sm text-destructive">{error}</p> : null
}

function describe(current: UserReferrer): string {
  const kind = current.enterprise ? COPY.enterprise : COPY.personal
  const source = current.source ? (SOURCES[current.source] ?? current.source) : '—'
  const at = current.at ? ` · ${current.at.slice(0, 10)}` : ''
  return `${current.name}（${kind} · ${source}${at}）`
}

function CurrentBinding({ current }: { current: UserReferrer | null | undefined }) {
  const text = current === undefined ? COPY.searching : current ? describe(current) : COPY.none
  return <p><span className="font-medium">{COPY.current}：</span>{text}</p>
}

function PartnerField({ picked, fixed, search, onPick }: { picked: PartnerOption | null; fixed: boolean; search?: SearchPartners; onPick: (p: PartnerOption | null) => void }) {
  if (picked) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-border px-3 py-2">
        <PartnerLine partner={picked} />
        {fixed ? null : <Button size="sm" variant="ghost" onClick={() => onPick(null)}>{COPY.change}</Button>}
      </div>
    )
  }
  return search ? <PartnerSearch search={search} onPick={onPick} /> : null
}

function BackdateFields({ state }: { state: ReturnType<typeof useBackdate> }) {
  return (
    <>
      <label className="flex items-start gap-2">
        <input type="checkbox" className="mt-1" checked={state.on} onChange={(e) => state.setOn(e.target.checked)} />
        <span className="grid gap-1">
          <span className="font-medium">{COPY.backdate}</span>
          <span className="text-xs text-muted-foreground">{COPY.backdateHint}</span>
        </span>
      </label>
      {state.on ? (
        <label className="grid gap-1">
          <span className="font-medium">{COPY.backdateDays(BACKDATE_MAX_DAYS)}</span>
          <Input type="number" min={1} max={BACKDATE_MAX_DAYS} step={1} value={state.days} onChange={(e) => state.setDays(e.target.value)} aria-invalid={!state.ok} />
        </label>
      ) : null}
    </>
  )
}

function PartnerLine({ partner }: { partner: PartnerOption }) {
  return (
    <span className="grid min-w-0 flex-1 gap-0.5">
      <span className="font-medium break-all">{partner.name}</span>
      <span className="text-xs text-muted-foreground">
        {partner.enterprise ? COPY.enterprise : COPY.personal} · {partner.slug}
        {partner.status === 'active' ? '' : ` · ${COPY.notActive(partner.status)}`}
      </span>
    </span>
  )
}

const DEBOUNCE_MS = 300
type SearchState = 'idle' | 'loading' | 'failed'

function usePartnerSearch(search: SearchPartners, query: string, enough: boolean) {
  const [found, setFound] = useState<PartnerOption[] | null>(null)
  const [state, setState] = useState<SearchState>('idle')
  const latest = useRef(0)
  useEffect(() => {
    const ticket = ++latest.current
    const timer = setTimeout(() => {
      if (!enough) { setFound(null); setState('idle'); return }
      setState('loading')
      search({ query })
        .catch((): ActionValue<PartnerOption[]> => ({ ok: false, code: 'INTERNAL', message: '' }))
        .then((result) => {
          if (ticket !== latest.current) return
          setFound(result.ok ? result.value : null)
          setState(result.ok ? 'idle' : 'failed')
        })
    }, DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query, enough, search])
  return { found, state }
}

function PartnerSearch({ search, onPick }: { search: SearchPartners; onPick: (p: PartnerOption) => void }) {
  const [query, setQuery] = useState('')
  const enough = query.trim().length >= 2
  const { found, state } = usePartnerSearch(search, query, enough)
  return (
    <div className="grid gap-2">
      <label className="grid gap-1">
        <span className="font-medium">{COPY.partner}</span>
        <Input value={query} maxLength={200} placeholder={COPY.partnerPlaceholder} autoComplete="off" onChange={(e) => setQuery(e.target.value)} />
      </label>
      <div aria-live="polite" className="grid gap-1">
        {enough ? <SearchStatus state={state} empty={found?.length === 0} /> : null}
        {enough && found ? <PartnerResults found={found} onPick={onPick} /> : null}
      </div>
    </div>
  )
}

function SearchStatus({ state, empty }: { state: SearchState; empty: boolean }) {
  if (state === 'failed') return <p role="alert" className="text-xs text-destructive">{COPY.searchFailed}</p>
  if (state === 'loading') return <p className="text-xs text-muted-foreground">{COPY.searching}</p>
  return empty ? <p className="text-xs text-muted-foreground">{COPY.noMatch}</p> : null
}

function PartnerResults({ found, onPick }: { found: PartnerOption[]; onPick: (p: PartnerOption) => void }) {
  if (found.length === 0) return null
  return (
    <ul className="grid gap-1" aria-label={COPY.partner}>
      {found.map((p) => (
        <li key={p.id}>
          <button
            type="button"
            disabled={p.status !== 'active'}
            onClick={() => onPick(p)}
            className={cn('flex min-h-11 w-full rounded-md border border-border px-3 py-2 text-left', p.status === 'active' ? 'hover:bg-accent' : 'cursor-not-allowed bg-muted/40')}
          >
            <PartnerLine partner={p} />
          </button>
        </li>
      ))}
    </ul>
  )
}
