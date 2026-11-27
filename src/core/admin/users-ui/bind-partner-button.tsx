'use client'

import { useState } from 'react'

import { Button } from '@/core/ui/button'
import { Dialog, DialogTrigger } from '@/core/ui/dialog'

import { useAdminAction } from '../shell/use-admin-action'
import type { ActionValue } from '../templates/types'
import type { BindInput, BindOutcome } from '../users/bind-partner-types'
import type { UserReferrer } from '../users/list-types'
import { BindPartnerDialog, type SearchPartners } from './bind-partner-dialog'
import { USERS_COPY } from './copy'

const COPY = USERS_COPY.bind

export type BindActions = {
  bind: (input: BindInput) => Promise<ActionValue<BindOutcome>>
  searchPartners: SearchPartners
}

type Props = { userId: string; banned: boolean; referrer: UserReferrer | null | undefined; actions: Partial<BindActions> }

// 绑定渠道 on the user detail (2029). Hidden for a banned account (the SQL function refuses it) and
// where the page was given no bind actions.
export function BindPartnerButton({ userId, banned, referrer, actions }: Props) {
  const [open, setOpen] = useState(false)
  const { pending, error, notice, run, clearError } = useAdminAction()
  const { bind, searchPartners } = actions
  if (!bind || !searchPartners || banned) return null
  const show = (next: boolean) => {
    clearError()
    setOpen(next)
  }
  return (
    <div className="grid gap-2">
      <Dialog open={open} onOpenChange={show}>
        <DialogTrigger asChild><Button variant="outline" className="justify-self-start">{COPY.open}</Button></DialogTrigger>
        {open && (
          <BindPartnerDialog
            current={referrer ?? null}
            partner={null}
            search={searchPartners}
            pending={pending}
            error={error}
            onCancel={() => setOpen(false)}
            onConfirm={(input) => run(() => bind({ ...input, userId }), (outcome) => {
              setOpen(false)
              return COPY.done(outcome)
            })}
          />
        )}
      </Dialog>
      {notice ? <p className="text-sm text-success">{notice}</p> : null}
    </div>
  )
}
