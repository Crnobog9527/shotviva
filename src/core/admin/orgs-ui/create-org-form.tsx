'use client'

import { useState } from 'react'

import { useRouter } from '@/core/i18n/navigation'
import { Button } from '@/core/ui/button'
import { Input } from '@/core/ui/input'

import { ORGS_COPY as COPY } from '../orgs/copy'
import type { OrgActionResult } from '../orgs/types'
import type { PickerUser } from '../orgs/user-picker'
import { Card, Field, Outcome } from './fields'
import { useOrgAction } from './use-org-action'
import { blockedReason, pickerLabel, type SearchUsers, UserPicker } from './user-picker'

export type CreateOrgAction = (input: unknown) => Promise<OrgActionResult<{ id: string }>>

// `initialOwner`: the account the form was opened for from a user's dossier (?owner=).
type Props = { create: CreateOrgAction; search: SearchUsers; initialOwner?: PickerUser | null; ownerMissing?: boolean }

export function CreateOrgForm({ create, search, initialOwner = null, ownerMissing = false }: Props) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [account, setAccount] = useState(initialOwner ? ownerAccount(initialOwner) : '')
  const [chosen, setChosen] = useState<PickerUser | null>(initialOwner)
  const [note, setNote] = useState('')
  const { pending, outcome, run } = useOrgAction()
  const blocked = chosen ? blockedReason(chosen) : null
  const ready = name.trim() !== '' && account.trim() !== '' && blocked === null
  return (
    <Card title={COPY.createTitle} hint={COPY.createHint}>
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault()
          if (!ready || pending) return
          run(() => create({ name, account, note }), (result) => { if (result.value) router.push(`/admin/orgs/${result.value.id}`) })
        }}
      >
        <Field label={COPY.name}><Input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} /></Field>
        <div className="grid gap-2 sm:col-span-2">
          <UserPicker search={search} orgId={null} onPick={(user) => { setChosen(user); setAccount(ownerAccount(user)) }} />
          <OwnerMissing show={ownerMissing} />
        </div>
        <Field label={COPY.account}>
          <Input value={account} maxLength={254} placeholder={COPY.accountPlaceholder} autoComplete="off" onChange={(e) => { setAccount(e.target.value); setChosen(null) }} />
        </Field>
        {chosen ? <ChosenOwner user={chosen} blocked={blocked} /> : null}
        <Field label={COPY.note} className="sm:col-span-2"><Input value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} /></Field>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <Button type="submit" disabled={pending || !ready}>{pending ? COPY.saving : COPY.create}</Button>
          <Outcome outcome={outcome} />
        </div>
      </form>
    </Card>
  )
}

function ChosenOwner({ user, blocked }: { user: PickerUser; blocked: string | null }) {
  return (
    <p className={blocked ? 'self-end text-sm text-destructive' : 'self-end text-sm text-muted-foreground'} role={blocked ? 'alert' : 'status'}>
      {COPY.pickerChosen(pickerLabel(user))}{blocked ? `：${blocked}（${COPY.ownerBlocked}）` : ''}
    </p>
  )
}

// What the form submits for a picked account: its email, else its id (the server looks both up exactly).
const ownerAccount = (user: PickerUser) => user.email ?? user.id

function OwnerMissing({ show }: { show: boolean }) {
  return show ? <p role="alert" className="text-sm text-destructive">{COPY.ownerLoadFailed}</p> : null
}
