'use client'

import { useState } from 'react'

import { Button } from '@/core/ui/button'

import { useAdminAction } from '../shell/use-admin-action'
import { BanDialog } from './ban-dialog'
import { USERS_COPY } from './copy'
import type { UserAdminActions } from './user-actions'

// One-account ban from the 「可疑注册」 list; the same dialog and reason as the user detail.
export function BanButton({ userId, ban }: { userId: string; ban: UserAdminActions['ban'] }) {
  const [open, setOpen] = useState(false)
  const { pending, error, notice, run, clearError } = useAdminAction()
  if (notice) return <span className="text-xs text-success">{notice}</span>
  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          clearError()
          setOpen(true)
        }}
      >
        {USERS_COPY.actions.ban}
      </Button>
      {open ? (
        <BanDialog
          mode="ban"
          pending={pending}
          error={error}
          onCancel={() => setOpen(false)}
          onConfirm={(reason) =>
            run(
              () => ban({ userId, reason }),
              () => {
                setOpen(false)
                return USERS_COPY.actions.done.ban
              },
            )
          }
        />
      ) : null}
    </>
  )
}
