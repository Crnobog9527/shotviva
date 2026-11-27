'use client'

import { useState } from 'react'

import { Dialog } from '@/core/ui/dialog'

import { useAdminAction } from '../shell/use-admin-action'
import type { ActionValue } from '../templates/types'
import { ORGS_COPY } from '../orgs/copy'
import type { PickerUser } from '../orgs/user-picker'
import type { BindInput, BindOutcome, PartnerOption } from '../users/bind-partner-types'
import type { UserReferrer } from '../users/list-types'
import { BindPartnerDialog } from '../users-ui/bind-partner-dialog'
import { USERS_COPY } from '../users-ui/copy'
import { Card } from './fields'
import { pickerLabel, type SearchUsers, UserPicker } from './user-picker'

const COPY = USERS_COPY.bind

export type BindCustomerActions = {
  search: SearchUsers
  referrer: (input: { userId: string }) => Promise<ActionValue<UserReferrer | null>>
  bind: (input: BindInput) => Promise<ActionValue<BindOutcome>>
}

// Staff are not customers (the SQL function refuses them too); a banned account cannot be bound.
function blocked(user: PickerUser): string | null {
  if (user.status === 'banned') return ORGS_COPY.pickerBlocked.banned
  if (user.status === 'in_this_org') return ORGS_COPY.pickerBlocked.in_this_org
  return null
}

// 推广名单 → 绑定已有客户 (2029): pick a registered account (also one that already paid) and bind it
// to this org's affiliate account, optionally back-dating commissions for its last N days.
export function BindCustomerCard({ orgId, orgName, account, actions }: {
  orgId: string
  orgName: string
  account: { userId: string; slug: string; status: string }
  actions: BindCustomerActions
}) {
  const [chosen, setChosen] = useState<PickerUser | null>(null)
  const [current, setCurrent] = useState<UserReferrer | null | undefined>(undefined)
  const { pending, error, notice, run, clearError } = useAdminAction()
  const partner: PartnerOption = { id: account.userId, name: orgName, slug: account.slug, status: account.status, enterprise: true }
  const pick = (user: PickerUser) => {
    clearError()
    setChosen(user)
    setCurrent(undefined)
    void actions.referrer({ userId: user.id })
      .then((r) => setCurrent(r.ok ? r.value : null))
      .catch(() => setCurrent(null))
  }
  return (
    <Card title={ORGS_COPY.bindCustomerTitle} hint={ORGS_COPY.bindCustomerHint}>
      {account.status === 'active' ? (
        <UserPicker search={actions.search} orgId={orgId} onPick={pick} blocked={blocked} />
      ) : (
        <p className="text-sm text-muted-foreground">{ORGS_COPY.bindCustomerInactive}</p>
      )}
      {notice ? <p className="text-sm text-success">{notice}</p> : null}
      <Dialog open={chosen !== null} onOpenChange={(open) => { if (!open) setChosen(null) }}>
        {chosen ? (
          <BindPartnerDialog
              key={chosen.id}
              customer={pickerLabel(chosen)}
              current={current}
              partner={partner}
              pending={pending}
              error={error}
              onCancel={() => setChosen(null)}
              onConfirm={(input) => run(() => actions.bind({ ...input, userId: chosen.id }), (outcome) => {
                setChosen(null)
                return `${pickerLabel(chosen)}：${COPY.done(outcome)}`
              })}
            />
        ) : null}
      </Dialog>
    </Card>
  )
}
