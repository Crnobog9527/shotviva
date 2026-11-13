'use client'

import { useMemo } from 'react'

import type { AdminInquiry } from '@/core/inquiries'

import { RecordDialogHost, reloading, type RecordLoader } from '../shell/record-dialog'
import { INQUIRY_PARAM } from '../shell/record-dialog-url'
import { INQUIRIES_COPY as COPY } from './copy'
import type { InquiryAdminActions } from './follow-up-form'
import { InquiryDetailView } from './inquiry-detail'

type Props = { load: RecordLoader<AdminInquiry>; actions: InquiryAdminActions }

// /admin/inquiries?inquiry=<id>: the inquiry over the list. Saving the follow-up reads the dialog
// again; the action's refresh() updates the list row (its status) behind it.
export function InquiryDialogHost({ load, actions }: Props) {
  return (
    <RecordDialogHost param={INQUIRY_PARAM} title={COPY.detailTitle} load={load}>
      {(inquiry, reload) => <InquiryDialogBody inquiry={inquiry} reload={reload} actions={actions} />}
    </RecordDialogHost>
  )
}

function InquiryDialogBody({ inquiry, reload, actions }: { inquiry: AdminInquiry; reload: () => void; actions: InquiryAdminActions }) {
  const live = useMemo<InquiryAdminActions>(() => ({ save: reloading(actions.save, reload) }), [actions, reload])
  return <InquiryDetailView inquiry={inquiry} actions={live} />
}
