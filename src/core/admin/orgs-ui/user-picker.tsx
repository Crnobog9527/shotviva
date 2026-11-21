'use client'

import { useEffect, useRef, useState } from 'react'

import { cn } from '@/core/ui/cn'
import { Input } from '@/core/ui/input'

import { ORGS_COPY as COPY } from '../orgs/copy'
import { PICKER_LIMIT, PICKER_MIN_CHARS } from '../orgs/picker-constants'
import type { PickerUser } from '../orgs/user-picker'

export type SearchUsers = (input: { query: string; orgId: string | null }) => Promise<{ ok: true; users: PickerUser[] } | { ok: false }>

export const pickerLabel = (user: Pick<PickerUser, 'id' | 'email' | 'phone'>) =>
  user.email ?? (user.phone ? `+${user.phone.replace(/^\+/, '')}` : user.id)

export function blockedReason(user: PickerUser): string | null {
  const reasons = COPY.pickerBlocked
  switch (user.status) {
    case 'ok': return null
    case 'banned': return reasons.banned
    case 'in_this_org': return reasons.in_this_org
    case 'personal_affiliate': return reasons.personal_affiliate
    case 'in_org': return reasons.in_org(user.orgName ?? '—', user.orgRole === 'owner' ? COPY.roleOwner : COPY.roleMember)
  }
}

const DEBOUNCE_MS = 300

// Type 2+ characters, pick a registered account. Accounts that cannot take the role are listed
// with the reason and cannot be clicked. The caller keeps its own exact input; this only helps
// to find the account.
export function UserPicker({ search, orgId, onPick, label = COPY.pickerLabel }: {
  search: SearchUsers
  orgId: string | null
  onPick: (user: PickerUser) => void
  label?: string
}) {
  const [query, setQuery] = useState('')
  const [users, setUsers] = useState<PickerUser[] | null>(null)
  const [state, setState] = useState<'idle' | 'loading' | 'failed'>('idle')
  const latest = useRef(0)
  const enough = query.trim().length >= PICKER_MIN_CHARS

  useEffect(() => {
    const ticket = ++latest.current
    const timer = setTimeout(() => {
      if (!enough) { setUsers(null); setState('idle'); return }
      setState('loading')
      search({ query, orgId })
        .catch((): { ok: false } => ({ ok: false }))
        .then((result) => {
          if (ticket !== latest.current) return
          setUsers(result.ok ? result.users : null)
          setState(result.ok ? 'idle' : 'failed')
        })
    }, DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query, enough, orgId, search])

  return (
    <div className="grid gap-2">
      <label className="grid gap-1 text-sm">
        <span className="font-medium">{label}</span>
        <Input value={query} maxLength={200} placeholder={COPY.pickerPlaceholder} autoComplete="off" onChange={(e) => setQuery(e.target.value)} />
      </label>
      <Results enough={enough} state={state} users={users} label={label} onPick={onPick} />
    </div>
  )
}

function Results({ enough, state, users, label, onPick }: {
  enough: boolean
  state: 'idle' | 'loading' | 'failed'
  users: PickerUser[] | null
  label: string
  onPick: (user: PickerUser) => void
}) {
  return (
    <div aria-live="polite" className="grid gap-1">
      <Status enough={enough} state={state} empty={users?.length === 0} />
      {enough && users && users.length > 0 ? (
        <ul className="grid gap-1" aria-label={label}>
          {users.map((user) => <PickerRow key={user.id} user={user} onPick={() => onPick(user)} />)}
          {users.length >= PICKER_LIMIT ? <li className="text-xs text-muted-foreground">{COPY.pickerMore(PICKER_LIMIT)}</li> : null}
        </ul>
      ) : null}
    </div>
  )
}

function Status({ enough, state, empty }: { enough: boolean; state: 'idle' | 'loading' | 'failed'; empty: boolean }) {
  if (state === 'failed') return <p role="alert" className="text-xs text-destructive">{COPY.pickerFailed}</p>
  if (!enough) return null
  if (state === 'loading') return <p className="text-xs text-muted-foreground">{COPY.pickerSearching}</p>
  return empty ? <p className="text-xs text-muted-foreground">{COPY.pickerNone}</p> : null
}

function PickerRow({ user, onPick }: { user: PickerUser; onPick: () => void }) {
  const blocked = blockedReason(user)
  return (
    <li>
      <button
        type="button"
        disabled={blocked !== null}
        onClick={onPick}
        className={cn('grid min-h-11 w-full gap-0.5 rounded-md border border-border px-3 py-2 text-left text-sm', blocked ? 'cursor-not-allowed bg-muted/40' : 'hover:bg-accent')}
      >
        <span className="break-all font-medium">{user.email ?? COPY.pickerNoEmail}{user.phone ? <span className="ml-2 font-normal text-muted-foreground">+{user.phone.replace(/^\+/, '')}</span> : null}</span>
        <span className="text-xs text-muted-foreground">
          {COPY.pickerCreated(user.createdAt.slice(0, 10))} · {user.tier ?? '—'} · {user.id.slice(0, 8)}
        </span>
        {blocked ? <span className="text-xs text-destructive">{blocked}</span> : null}
      </button>
    </li>
  )
}
