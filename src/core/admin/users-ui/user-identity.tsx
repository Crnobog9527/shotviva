'use client'

import { createContext, useContext, useState } from 'react'
import { Pencil } from 'lucide-react'

import { Badge } from '@/core/ui/badge'
import { Button } from '@/core/ui/button'
import { Input } from '@/core/ui/input'

import { useAdminAction } from '../shell/use-admin-action'
import type { ActionValue } from '../templates/types'
import type { UserIdentity, UserListRow } from '../users/list-types'
import { USERS_COPY } from './copy'

const COPY = USERS_COPY.identity

export type SaveLabel = (input: { userId: string; label: string | null }) => Promise<ActionValue<string | null>>

// The list's save action, given once by UsersList so the table and the phone cards share it.
export const LabelSaver = createContext<SaveLabel | null>(null)

// Who the account is (Owner 2026-11-23): the admin's tag with an inline editor, then the org seat
// and affiliate status, and the affiliate admin's note. The tag is the same value the affiliate
// admin shows for an affiliate (affiliates.admin_label).
export function IdentityLines({ row }: { row: UserListRow }) {
  const identity = row.identity
  if (!identity) return null
  return (
    <div className="grid min-w-0 gap-1">
      <LabelLine userId={row.id} label={identity.label} />
      <Seats identity={identity} />
      {identity.affiliate?.note ? (
        <p className="line-clamp-2 text-xs break-words text-muted-foreground" title={identity.affiliate.note}>
          {COPY.affiliateNote}：{identity.affiliate.note}
        </p>
      ) : null}
    </div>
  )
}

function Seats({ identity }: { identity: UserIdentity }) {
  const { org, affiliate } = identity
  if (!org && !affiliate) return null
  return (
    <div className="flex flex-wrap gap-1">
      {org ? (
        <Badge variant={org.role === 'owner' ? 'default' : 'secondary'} className="max-w-full truncate">
          {(org.role === 'owner' ? COPY.owner : COPY.member)(org.name ?? COPY.unknownOrg)}
        </Badge>
      ) : null}
      {affiliate ? <Badge variant="outline">{COPY.affiliate(affiliate.status)}</Badge> : null}
    </div>
  )
}

function LabelLine({ userId, label }: { userId: string; label: string | null }) {
  const save = useContext(LabelSaver)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(label ?? '')
  const { pending, error, run } = useAdminAction()
  if (!save) return label ? <p className="truncate text-sm font-semibold">{label}</p> : null
  if (!editing) {
    return (
      <div className="flex min-w-0 items-center gap-1">
        {label ? <span className="truncate text-sm font-semibold" title={label}>{label}</span> : null}
        <button
          type="button"
          onClick={() => { setDraft(label ?? ''); setEditing(true) }}
          className="inline-flex min-h-8 shrink-0 items-center gap-1 rounded px-1 text-xs text-muted-foreground hover:text-foreground"
          aria-label={label ? COPY.editLabel : COPY.addLabel}
        >
          <Pencil aria-hidden className="size-3.5" />
          {label ? null : COPY.addLabel}
        </button>
      </div>
    )
  }
  return (
    <form
      className="grid gap-1"
      onSubmit={(event) => {
        event.preventDefault()
        run(() => save({ userId, label: draft.trim() || null }), () => setEditing(false))
      }}
    >
      <Input value={draft} maxLength={60} autoFocus placeholder={COPY.labelPlaceholder} onChange={(e) => setDraft(e.target.value)} className="h-8 text-sm" aria-label={COPY.editLabel} />
      <div className="flex gap-1">
        <Button type="submit" size="sm" disabled={pending}>{COPY.save}</Button>
        <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setEditing(false)}>{COPY.cancel}</Button>
      </div>
      {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
    </form>
  )
}
