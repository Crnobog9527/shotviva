'use client'

import { useState } from 'react'

import { Button } from '@/core/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/core/ui/dialog'

import { TRANSFER_COPY as COPY } from '../orgs/transfer-copy'
import type { OrgActionResult } from '../orgs/types'
import type { PickerUser } from '../orgs/user-picker'
import { Card, Outcome } from './fields'
import { useOrgAction } from './use-org-action'
import { blockedReason, pickerLabel, type SearchUsers, UserPicker } from './user-picker'

export type TransferOwnerAction = (input: unknown) => Promise<OrgActionResult<{ applied: boolean }>>

type Props = { orgId: string; ownerId: string; ownerLabel: string; updatedAt: string; search: SearchUsers; transfer: TransferOwnerAction }

// An active member of this org may become owner; everyone else follows the add-member rules,
// except that a personal affiliate account without history is fine (the transfer deletes it,
// 1990) and one with history is not, whatever its status. The SQL checks every rule again.
export function transferBlocked(ownerId: string) {
  return (user: PickerUser) => {
    if (user.id === ownerId) return COPY.current
    if (user.status === 'banned' || user.status === 'in_org') return blockedReason(user)
    return user.affiliateHistory ? COPY.pickerHistory : null
  }
}

// 更换主管理员: open, pick, then a confirm dialog that lists what stays with the org.
export function TransferOwnerForm({ orgId, ownerId, ownerLabel, updatedAt, search, transfer }: Props) {
  const [open, setOpen] = useState(false)
  const [chosen, setChosen] = useState<PickerUser | null>(null)
  const { pending, outcome, run } = useOrgAction()
  const close = () => { setChosen(null); setOpen(false) }
  return (
    <Card title={COPY.title} hint={COPY.hint}>
      {open ? (
        <div className="grid gap-2">
          <UserPicker search={search} orgId={orgId} onPick={setChosen} label={COPY.pickerLabel} blocked={transferBlocked(ownerId)} />
          <Button type="button" variant="outline" className="justify-self-start" onClick={close}>{COPY.cancel}</Button>
        </div>
      ) : (
        <Button type="button" variant="outline" className="justify-self-start" onClick={() => setOpen(true)}>{COPY.open}</Button>
      )}
      {chosen ? (
        <ConfirmTransfer
          from={ownerLabel}
          to={pickerLabel(chosen)}
          pending={pending}
          error={outcome && !outcome.ok ? outcome.message : null}
          onCancel={() => setChosen(null)}
          onConfirm={() => run(() => transfer({ orgId, userId: chosen.id, expectedUpdatedAt: updatedAt }), close)}
        />
      ) : null}
      <Outcome outcome={outcome} />
    </Card>
  )
}

function ConfirmTransfer({ from, to, pending, error, onCancel, onConfirm }: {
  from: string; to: string; pending: boolean; error: string | null; onCancel: () => void; onConfirm: () => void
}) {
  return (
    <Dialog open onOpenChange={(isOpen) => !isOpen && !pending && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{COPY.confirmTitle}</DialogTitle>
          <DialogDescription className="break-all">{COPY.confirmBody(from, to)}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2 text-sm">
          <p className="font-medium">{COPY.staysTitle}</p>
          <ul className="grid list-disc gap-1 pl-5">
            {COPY.stays.map((line) => <li key={line}>{line}</li>)}
          </ul>
          <p className="text-muted-foreground">{COPY.personal}</p>
          <p className="text-muted-foreground">{COPY.removesEmpty}</p>
        </div>
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={pending}>{COPY.cancel}</Button>
          <Button onClick={onConfirm} disabled={pending}>{pending ? COPY.saving : COPY.confirm}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
