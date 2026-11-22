import type { Metadata } from 'next'

import { AdminPage } from '@/core/admin'
import { TRACE_COPY, TraceTool } from '@/core/admin/trace-ui'
import { requireAdmin } from '@/core/auth'

import { readTraceAction, stageTraceAction } from './actions'

// /admin/trace 水印追查: read the tracking mark of a free work found in the wild (storage/protect).
// A full search of a resized, cropped picture takes a few seconds.
export const maxDuration = 60

export const metadata: Metadata = { title: TRACE_COPY.title }

export default async function AdminTracePage() {
  await requireAdmin()
  return (
    <AdminPage title={TRACE_COPY.title}>
      <TraceTool actions={{ stage: stageTraceAction, read: readTraceAction }} />
    </AdminPage>
  )
}
