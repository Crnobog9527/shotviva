'use client'

import { useMemo } from 'react'

import { Button } from '@/core/ui/button'
import { Dialog, DialogContent } from '@/core/ui/dialog'

import type { JobSupportActions } from '../support-ui'
import type { ActionValue } from '../templates/types'
import { USERS_COPY } from './copy'
import { useUserDetail, type UserDetailLoader } from './use-user-detail'
import type { UserAdminActions } from './user-actions'
import { UserDetailView } from './user-detail'
import { UserDialogHeader } from './user-dialog-header'

const COPY = USERS_COPY.dialog

export type UserDialogActions = { load: UserDetailLoader; user: UserAdminActions; jobs: JobSupportActions }

type Props = { userId: string; jobId: string | null; actions: UserDialogActions; stripeLive: boolean; onClose: () => void }

// Runs an action and, when it worked, reads the dialog again (the server action already
// refreshed the page behind it).
function reloading<I, T>(action: (input: I) => Promise<ActionValue<T>>, reload: () => void) {
  return async (input: I) => {
    const result = await action(input)
    if (result.ok) reload()
    return result
  }
}

// The user detail as a dialog over the current admin page (ARCHITECTURE §10.a): a wide panel on
// a computer, the whole screen on a phone. Header fixed, body scrolls.
export function UserDetailDialog({ userId, jobId, actions, stripeLive, onClose }: Props) {
  const detail = useUserDetail(userId, jobId, actions.load)
  const { reload } = detail
  const userActions = useMemo<UserAdminActions>(
    () => ({ adjust: reloading(actions.user.adjust, reload), ban: reloading(actions.user.ban, reload), unban: reloading(actions.user.unban, reload) }),
    [actions.user, reload],
  )
  const jobActions = useMemo<JobSupportActions>(() => ({ view: actions.jobs.view, compensate: reloading(actions.jobs.compensate, reload) }), [actions.jobs, reload])
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="top-0 left-0 flex h-dvh max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 p-0 sm:max-w-none md:top-1/2 md:left-1/2 md:h-[calc(100dvh-48px)] md:w-[min(1120px,calc(100%-48px))] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-lg md:border"
      >
        <UserDialogHeader userId={userId} data={detail.data} />
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 pb-[calc(env(safe-area-inset-bottom)+16px)] md:p-6">
          {detail.data ? (
            <UserDetailView
              data={detail.data}
              actions={userActions}
              support={{ stripeLive, jobActions, focusJobId: jobId }}
              onLedgerPage={detail.setCursor}
            />
          ) : (
            <DialogState missing={detail.missing} failed={detail.failed} onRetry={reload} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function DialogState({ missing, failed, onRetry }: { missing: boolean; failed: string | null; onRetry: () => void }) {
  if (missing) return <p className="py-12 text-center text-sm text-muted-foreground">{COPY.missing}</p>
  if (failed) {
    return (
      <div role="alert" className="grid justify-items-center gap-3 py-12 text-sm">
        <p className="text-destructive">{failed}</p>
        <Button size="sm" variant="outline" onClick={onRetry}>
          {COPY.retry}
        </Button>
      </div>
    )
  }
  return (
    <p role="status" className="py-12 text-center text-sm text-muted-foreground">
      {COPY.loading}
    </p>
  )
}
