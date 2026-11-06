import { Link } from '@/core/i18n/ui'
import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

import { EDIT_TEMPLATE_ID } from '@/core/templates/edit-params'
import { buttonVariants } from '@/core/ui/button'
import { cn } from '@/core/ui/cn'

import { DetailHead } from '../detail/detail-head'
import { DetailPhoto } from '../detail/detail-photo'
import { NoteQuote } from '../detail/note-quote'
import { PhotoFacts } from '../detail/photo-facts'
import type { PhotoDetail } from '../detail/photo-detail'
import type { PhotoItem } from '../photos/photo-item'
import { tierName, tierPx } from '../workspace/workspace-options'
import { SIDE_BY_SIDE } from './action-styles'
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
}

// A finished photo opened from Photos (T6 photo.html; DESIGN §4.4): the result with its views,
// then name, meta, Share as the one primary (Download · px from lg), Edit and Make again side by side, what an edit came from, the
// user's note and the facts. Two columns from lg, the photo sticky on the left.
export function ResultView({ item, detail, shareText, edit, parent, parentDeleted = false, change, remove }: Props) {
  const t = useTranslations('app')
  const fileUrl = item.fileUrl as string
  // An edit has no template page to go back to. No prefetch: opening the workspace copies the
  // kept photo back to a fresh upload (T40).
  const again =
    item.templateId === EDIT_TEMPLATE_ID ? null : (
      <Link href={`/generate/${item.templateId}?again=${item.id}`} prefetch={false} className={buttonVariants({ variant: 'glass', size: 'touch', className: SIDE_BY_SIDE })}>
        <AgainIcon />
        {t('result.makeAgain')}
      </Link>
    )
  return (
    <section
      aria-label={t('photos.photoAlt', { name: item.templateName })}
      className="px-4 pt-2 md:mx-auto md:max-w-[520px] md:px-0 lg:grid lg:max-w-none lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start lg:gap-x-12 lg:px-(--gutter) lg:pt-6"
    >
      <div className="lg:sticky lg:top-[132px]">
        <DetailPhoto
          src={fileUrl}
          alt={t('workspace.resultAlt', { name: item.templateName })}
          work={{ pool: item.creditPool, visibility: item.visibility }}
          tierLabel={t('result.tierPx', { tier: tierName(item.resolution, t), px: tierPx(item.resolution) })}
          original={{ source: detail.original, alt: t('result.originalAlt', { name: item.templateName }) }}
        />
      </div>
      <div className="pt-4 lg:pt-0">
        <DetailHead item={item} />
        <div className="mt-4 grid gap-2">
          <ShareButton fileUrl={fileUrl} name={`shotviva-${item.templateId}`} shareText={shareText} px={tierPx(item.resolution)} />
          {/* Edit and Make again side by side (B comp photo.html .acts .two); alone, full width. */}
          <QuietActions edit={edit} again={again} />
          {remove}
        </div>
        {parent ? <EditedFrom parent={parent} /> : parentDeleted ? <EditedFromDeleted /> : null}
        {change ? <YourChange text={change} /> : null}
        {detail.note ? <NoteQuote note={detail.note} /> : null}
        <PhotoFacts item={item} original={detail.original} keptWithWork={detail.keptWithWork} />
      </div>
    </section>
  )
}

function QuietActions({ edit, again }: { edit: ReactNode; again: ReactNode }) {
  if (!edit && !again) return null
  return (
    <div className={cn('grid gap-2', edit && again ? 'grid-cols-2' : null)}>
      {edit}
      {again}
    </div>
  )
}

function AgainIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-[18px] text-primary" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3M18 3v4h-4M6 21v-4h4" />
    </svg>
  )
}
