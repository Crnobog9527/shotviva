'use client'

import { useSearchParams } from 'next/navigation'
import { useCallback } from 'react'

import { browserHistory, closeUser } from './dialog-history'
import { JOB_PARAM, USER_PARAM } from './dialog-url'
import { UserDetailDialog, type UserDialogActions } from './user-detail-dialog'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type Props = { actions: UserDialogActions; stripeLive: boolean }

// Mounted once in the admin layout: whichever admin page the address is on, ?user=<id> shows
// that user's detail dialog over it (T77). Keyed by the id, so moving to another user (a same-IP
// account) starts a fresh read.
export function UserDialogHost({ actions, stripeLive }: Props) {
  const params = useSearchParams()
  const userId = params.get(USER_PARAM)
  const jobId = params.get(JOB_PARAM)
  const close = useCallback(() => closeUser(browserHistory), [])
  if (!userId || !UUID.test(userId)) return null
  return <UserDetailDialog key={userId} userId={userId} jobId={jobId && UUID.test(jobId) ? jobId : null} actions={actions} stripeLive={stripeLive} onClose={close} />
}
