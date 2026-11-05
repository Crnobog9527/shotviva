'use client'

import { useState } from 'react'

import { ADMIN_LIST_CAP, type AdminRequest, type RequestStatus } from '../types'
import { COPY } from './copy'
import { countByStatus, defaultSort, filterRequests, type RequestFilter } from './filter-requests'
import { RejectDialog } from './reject-dialog'
import { RequestsTable } from './requests-table'
import { RequestsToolbar } from './requests-toolbar'
import { ShipDialog } from './ship-dialog'
import type { ReviewActions, TemplateOption } from './types'
import { useReview } from './use-review'

type Props = {
  requests: AdminRequest[]
  templates: readonly TemplateOption[]
  actions: ReviewActions
}

// The request review page (ARCHITECTURE §10 page 2): one tab per status, search, sort by votes.
export function RequestsReview({ requests, templates, actions }: Props) {
  const [filter, setFilter] = useState<RequestFilter>({ status: 'pending', sort: 'newest', query: '' })
  const [rejecting, setRejecting] = useState<AdminRequest | null>(null)
  const [shipping, setShipping] = useState<AdminRequest | null>(null)
  const { pending, error, run } = useReview(actions)
  const onStatus = (status: RequestStatus) => setFilter({ ...filter, status, sort: defaultSort(status) })
  const counts = countByStatus(requests)

  return (
    <div className="grid gap-4">
      <RequestsToolbar
        filter={filter}
        counts={counts}
        onStatus={onStatus}
        onSort={(sort) => setFilter({ ...filter, sort })}
        onQuery={(query) => setFilter({ ...filter, query })}
      />
      {counts[filter.status] >= ADMIN_LIST_CAP && <p className="text-muted-foreground text-sm">{COPY.capped(ADMIN_LIST_CAP)}</p>}
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      <RequestsTable
        requests={filterRequests(requests, filter)}
        templates={templates}
        pending={pending}
        onApprove={(request) => run({ id: request.id, action: 'approve' })}
        onReject={setRejecting}
        onShip={setShipping}
      />
      <RejectDialog
        request={rejecting}
        pending={pending}
        onCancel={() => setRejecting(null)}
        onConfirm={(request) => run({ id: request.id, action: 'reject' }, () => setRejecting(null))}
      />
      <ShipDialog
        request={shipping}
        templates={templates}
        pending={pending}
        onCancel={() => setShipping(null)}
        onConfirm={(request, templateId) => run({ id: request.id, action: 'ship', templateId }, () => setShipping(null))}
      />
    </div>
  )
}
