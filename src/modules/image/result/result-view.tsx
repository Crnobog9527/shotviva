import { Link } from '@/core/i18n/ui'
import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

import { cn } from '@/core/ui/cn'

import { DetailHead } from '../detail/detail-head'
import { EditHint } from '../edit-ui/edit-hint'
import { DetailPhoto } from '../detail/detail-photo'
import { NoteQuote } from '../detail/note-quote'
import { PhotoFacts } from '../detail/photo-facts'
import type { PhotoDetail } from '../detail/photo-detail'
import type { PhotoItem } from '../photos/photo-item'
import { tierName, tierPx } from '../workspace/workspace-options'
import { EditedFrom, EditedFromDeleted, YourChange, type EditParent } from './edited-from'
import { ShareButton } from './share-button'

type Props = {
  item: PhotoItem
  detail: PhotoDetail
  shareText: string
  // The Edit button (T30) when editing is on: the second button, under Share.
  edit?: ReactNode
  // For an edit: the work it was made from (when it still exists) and the words it was asked with.
  parent?: EditParent | null
  // An edit whose source work the user deleted (T41): "Edited from" says so, with no link.
  parentDeleted?: boolean
  change?: string | null
  // "Delete" (T41): the last action, quiet and in the danger colour.
  remove?: ReactNode
  // The Photos viewer around it (2026-11-12): its two columns (this section takes part in the
  // viewer's grid), the step buttons over the photo, Make again switching the viewer in place,
  // and the batch the work belongs to.
  viewer: { tray: string; side: string; photoExtra: ReactNode; again: ReactNode; batch: ReactNode }
}

// A finished photo opened from Photos (T6 photo.html; DESIGN §4.4), in the Photos viewer: the
// result with its views, then name, meta, Share as the one primary (Download · px from lg), Edit
// and Make again side by side, what an edit came from, the user's note and the facts.
export function ResultView({ item, detail, shareText, edit, parent, parentDeleted = false, change, remove, viewer }: Props) {
  const t = useTranslations('app')
  const fileUrl = item.fileUrl as string
  return (
    <section
      aria-label={t('photos.photoAlt', { name: item.templateName })}
      className="contents"
    >
      <div className={viewer.tray}>
        <DetailPhoto
          src={fileUrl}
          alt={t('workspace.resultAlt', { name: item.templateName })}
          work={{ pool: item.creditPool, visibility: item.visibility }}
          tierLabel={t('result.tierPx', { tier: tierName(item.resolution, t), px: tierPx(item.resolution) })}
          original={{ source: detail.original, alt: t('result.originalAlt', { name: item.templateName }) }}
        />
        {viewer.photoExtra}
      </div>
      <div className={viewer.side}>
        <DetailHead item={item} />
        <div className="mt-4 grid gap-2">
          <ShareButton fileUrl={fileUrl} name={`shotviva-${item.templateId}`} shareText={shareText} px={tierPx(item.resolution)} watermarked={item.creditPool === 'free'} />
          {/* Edit and Make again side by side (B comp photo.html .acts .two); alone, full width. */}
          <QuietActions edit={edit} again={viewer.again} />
          {remove}
        </div>
        {viewer.batch}
        {parent ? <EditedFrom parent={parent} /> : parentDeleted ? <EditedFromDeleted /> : null}
        {change ? <YourChange text={change} /> : null}
        {detail.note ? <NoteQuote note={detail.note} /> : null}
        <PhotoFacts item={item} original={detail.original} keptWithWork={detail.keptWithWork} reference={detail.reference} />
        {detail.reference ? <ProblemLink jobId={item.id} /> : null}
      </div>
    </section>
  )
}

// "Problem with this photo?" (T78): Help & feedback on the account page, as an image issue with
// this work picked, so the ticket arrives with its reference number. No prefetch: the account
// page reads payments and the session's tier.
function ProblemLink({ jobId }: { jobId: string }) {
  const t = useTranslations('app.result')
  return (
    <p className="mt-3 flex justify-end">
      <Link
        href={`/account?help=new&job=${jobId}`}
        prefetch={false}
        className="inline-flex min-h-11 items-center text-label text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        {t('problem')}
      </Link>
    </p>
  )
}

function QuietActions({ edit, again }: { edit: ReactNode; again: ReactNode }) {
  if (!edit && !again) return null
  return (
    <div className="grid gap-2">
      <div className={cn('grid gap-2', edit && again ? 'grid-cols-2' : null)}>
        {edit}
        {again}
      </div>
      {edit ? <EditHint /> : null}
    </div>
  )
}

// Make again's mark, also on the Photos viewer's Make again.
export function AgainIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-[18px] text-primary" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3M18 3v4h-4M6 21v-4h4" />
    </svg>
  )
}
