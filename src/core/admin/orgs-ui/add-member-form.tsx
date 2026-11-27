'use client'

import { useState } from 'react'

import { Button } from '@/core/ui/button'

import { ORGS_COPY as COPY } from '../orgs/copy'
import type { OrgActionResult } from '../orgs/types'
import type { PickerUser } from '../orgs/user-picker'
import { Card, Outcome } from './fields'
import { useOrgAction } from './use-org-action'
import { blockedReason, pickerLabel, type SearchUsers, UserPicker } from './user-picker'

export type AddMemberAction = (input: unknown) => Promise<OrgActionResult<{ applied: boolean }>>

// 添加成员: pick a registered account, confirm, and the account joins the org. Two steps (pick,
// then confirm) so a mis-click on a search row never adds someone. A repeat is harmless: the SQL
// treats an account already in this org as done.
export function AddMemberForm({ orgId, suspended, search, add }: { orgId: string; suspended: boolean; search: SearchUsers; add: AddMemberAction }) {
  const [chosen, setChosen] = useState<PickerUser | null>(null)
  const { pending, outcome, run } = useOrgAction()
  const blocked = chosen ? blockedReason(chosen) : null
  return (
    <Card title={COPY.addMemberTitle} hint={COPY.addMemberHint}>
      <UserPicker search={search} orgId={orgId} onPick={setChosen} />
      {chosen ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm">{COPY.addMemberConfirm(pickerLabel(chosen))}</p>
          <Button
            type="button"
            disabled={pending || blocked !== null || suspended}
            onClick={() => run(() => add({ orgId, userId: chosen.id }), () => setChosen(null))}
          >
            {pending ? COPY.saving : COPY.addMember}
          </Button>
          <Button type="button" variant="outline" disabled={pending} onClick={() => setChosen(null)}>{COPY.pickerClear}</Button>
        </div>
      ) : null}
      {suspended ? <p className="text-sm text-destructive">{COPY.orgSuspended}</p> : null}
      <Outcome outcome={outcome} />
    </Card>
  )
}
