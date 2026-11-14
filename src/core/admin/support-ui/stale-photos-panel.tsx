'use client'

import { useState } from 'react'

import { Button } from '@/core/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/core/ui/table'

import type { StalePhoto, StaleRefund } from '../../poster/stale-photos'
import { formatBeijing } from '../shell/format'
import { useAdminAction } from '../shell/use-admin-action'
import type { ActionValue } from '../templates/types'
import { UserLink } from '../users-ui/user-link'
import { ConfirmDialog } from './confirm-dialog'
import { SUPPORT_COPY } from './copy'

const COPY = SUPPORT_COPY.stalePhotos

export type RefundStalePhotos = () => Promise<ActionValue<StaleRefund>>

// Charged 拍照识别 runs still pending after 10 minutes (ARCHITECTURE §5.3「每周复用」): the cron
// sweeper refunds them every 5 minutes; this shows any it has not reached yet, with the same
// refund at once. Hidden when there are none.
export function StalePhotosPanel({ photos, refund }: { photos: StalePhoto[]; refund: RefundStalePhotos }) {
  const [asking, setAsking] = useState(false)
  const { pending, error, notice, run, clearError } = useAdminAction()
  if (photos.length === 0 && !notice) return null
  const confirm = () => run(() => refund(), (result) => {
    setAsking(false)
    return COPY.done(result.refunded, result.skipped)
  })
  return (
    <section className="grid gap-3 rounded-lg border border-destructive/40 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-semibold">{COPY.title(photos.length)}</h2>
        {photos.length > 0 ? <Button size="sm" variant="destructive" className="ml-auto" onClick={() => { clearError(); setAsking(true) }}>{COPY.refundAll}</Button> : null}
      </div>
      <p className="text-sm text-muted-foreground">{COPY.body}</p>
      {notice ? <p className="text-sm text-success">{notice}</p> : null}
      {photos.length > 0 ? <PhotosTable photos={photos} /> : null}
      {asking ? (
        <ConfirmDialog title={COPY.confirmTitle(photos.length)} body={COPY.confirmBody} confirm={COPY.confirm}
          pending={pending} error={error} onCancel={() => setAsking(false)} onConfirm={confirm} />
      ) : null}
    </section>
  )
}

function PhotosTable({ photos }: { photos: StalePhoto[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{COPY.columns.createdAt}</TableHead>
          <TableHead>{COPY.columns.user}</TableHead>
          <TableHead>{COPY.columns.credits}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {photos.map((photo) => (
          <TableRow key={photo.id}>
            <TableCell className="font-mono text-xs whitespace-nowrap">{formatBeijing(photo.createdAt)}</TableCell>
            <TableCell><UserLink userId={photo.userId} className="font-mono text-xs">{photo.userId.slice(0, 8)}</UserLink></TableCell>
            <TableCell className="font-mono text-xs whitespace-nowrap">{photo.credits} · {SUPPORT_COPY.pools[photo.creditPool]}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
