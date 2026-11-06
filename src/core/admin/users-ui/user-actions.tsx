'use client'

import { useState } from 'react'

import { Button } from '@/core/ui/button'

import { useAdminAction } from '../shell/use-admin-action'
import type { ActionValue } from '../templates/types'
import { AdjustDialog, type AdjustInput, type PoolBalances } from './adjust-dialog'
import { BanDialog } from './ban-dialog'
import { USERS_COPY } from './copy'

const COPY = USERS_COPY.actions

export type UserAdminActions = {
  adjust: (input: AdjustInput & { userId: string }) => Promise<ActionValue<null>>
  ban: (input: { userId: string; reason: string }) => Promise<ActionValue<null>>
  unban: (input: { userId: string; reason: string }) => Promise<ActionValue<null>>
}

type Open = 'adjust' | 'ban' | 'unban' | null

// Dangerous operations open a dialog that asks for the reason and confirms (DESIGN §7).
type Props = { userId: string; banned: boolean; balances: PoolBalances; actions: UserAdminActions }

export function UserActions({ userId, banned, balances, actions }: Props) {
  const [open, setOpen] = useState<Open>(null)
  const { pending, error, notice, run, clearError } = useAdminAction()
  const show = (which: Open) => {
    clearError()
    setOpen(which)
  }
  const done = (which: Exclude<Open, null>) => () => {
    setOpen(null)
    return COPY.done[which]
  }
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => show('adjust')}>{COPY.adjust}</Button>
        <Button variant="outline" onClick={() => show(banned ? 'unban' : 'ban')}>
          {banned ? COPY.unban : COPY.ban}
        </Button>
      </div>
      {notice ? <p className="text-sm text-success">{notice}</p> : null}
      {open === 'adjust' ? (
        <AdjustDialog
          balances={balances}
          pending={pending}
          error={error}
          onCancel={() => setOpen(null)}
          onConfirm={(input) => run(() => actions.adjust({ ...input, userId }), done('adjust'))}
        />
      ) : null}
      {open === 'ban' || open === 'unban' ? (
        <BanDialog
          mode={open}
          pending={pending}
          error={error}
          onCancel={() => setOpen(null)}
          onConfirm={(reason) => run(() => actions[open]({ userId, reason }), done(open))}
        />
      ) : null}
    </div>
  )
}
