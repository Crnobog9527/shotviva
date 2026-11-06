import Link from 'next/link'
import { useTranslations } from 'next-intl'

import { buttonVariants } from '@/core/ui/button'

import { DetailHead } from '../detail/detail-head'
import { DetailPhoto } from '../detail/detail-photo'
import { NoteQuote } from '../detail/note-quote'
import { PhotoFacts } from '../detail/photo-facts'
import type { PhotoDetail } from '../detail/photo-detail'
import type { PhotoItem } from '../photos/photo-item'
import { tierName, tierPx } from '../workspace/workspace-options'
import { ShareButton } from './share-button'

// A finished photo opened from Photos (T6 photo.html; DESIGN §4.4): the result with its views,
// then name, meta, Share as the one primary, Make again, the user's note and the facts. Two
// columns from lg, the photo sticky on the left.
export function ResultView({ item, detail, shareText }: { item: PhotoItem; detail: PhotoDetail; shareText: string }) {
  const t = useTranslations('app')
  const fileUrl = item.fileUrl as string
  return (
    <section
      aria-label={t('photos.photoAlt', { name: item.templateName })}
      className="px-4 pt-2 md:mx-auto md:max-w-[520px] md:px-0 lg:grid lg:max-w-none lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start lg:gap-x-12 lg:px-4 lg:pt-6"
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
          <ShareButton fileUrl={fileUrl} name={`shotviva-${item.templateId}`} shareText={shareText} />
          <Link href={`/generate/${item.templateId}`} className={buttonVariants({ variant: 'glass', size: 'touch', className: 'min-h-12 gap-1.5' })}>
            <AgainIcon />
            {t('result.makeAgain')}
          </Link>
        </div>
        {detail.note ? <NoteQuote note={detail.note} /> : null}
        <PhotoFacts item={item} original={detail.original} />
      </div>
    </section>
  )
}

function AgainIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-[18px] text-primary" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3M18 3v4h-4M6 21v-4h4" />
    </svg>
  )
}
