import { REPLAY_BLOCK_CLASS } from '@/core/analytics/browser'
import { tileUrlFor } from '@/core/jobs/job-view'
import { ThumbImg } from '@/core/ui/thumb-img'
import { useTranslations } from 'next-intl'

import { makeAgainHref } from '../again/again-start'
import { WorkMark } from '../result/work-tag'
import { SelectTile } from '../work-share/select-tile'
import type { PhotoItem } from './photo-item'
import { WorkLink } from './viewer/work-link'

// A phone's first screen (three rows of three) is fetched at once; the rest wait until they are
// near the viewport, which on a desktop is at once for its second row too. The first six go ahead
// of everything else (a phone's first two rows, a desktop's first): one of them is the page's
// largest paint, and not always the very first, because the browser passes over a flat picture
// (a cut-out on white) when it picks one. Every picture fetched eagerly shares a slow line with
// it, so the eager set stays as small as the first screen (measured 2026-11-28, #998).
export const EAGER_TILES = 9
const FIRST_ROW = 6

// One finished work on Photos' grid (2026-11-28): the picture alone, so a phone shows a dozen
// works where it showed two. Its name and settings are the viewer's to tell; with a pointer they
// also rise over the tile on hover or focus, with "Make again" when the template is still in the
// catalogue (an edit or a retired template has none). The tile is marked only when it is not the
// usual private, clean work (work-tag.tsx). place: where the tile comes in the grid, 0 first.
export function DoneCard({ item, meta, live, place }: { item: PhotoItem; meta: string; live: boolean; place: number }) {
  const t = useTranslations('app')
  return (
    <div className="group relative">
      <SelectTile jobId={item.id} name={item.templateName} />
      <WorkLink workId={item.id} className="press block rounded-inner">
        <span className="relative block aspect-[4/5] overflow-hidden rounded-inner bg-muted">
          {item.thumbUrl ? (
            <ThumbImg
              src={item.thumbUrl}
              fallback={tileUrlFor(item.id)}
              alt={t('photos.photoAlt', { name: item.templateName })}
              width={320}
              height={400}
              loading={place < EAGER_TILES ? 'eager' : 'lazy'}
              fetchPriority={place < FIRST_ROW ? 'high' : 'auto'}
              decoding="async"
              className={`${REPLAY_BLOCK_CLASS} absolute inset-0 size-full object-cover transition-transform duration-600 ease-house group-hover:scale-[1.03]`}
            />
          ) : null}
          <WorkMark
            pool={item.creditPool}
            visibility={item.visibility}
            className="absolute bottom-1.5 left-1.5 transition-opacity duration-250 group-hover:opacity-0 [@media(hover:hover)]:group-focus-within:opacity-0"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 hidden bg-linear-to-t from-(--photo-fade) to-transparent px-2.5 pt-10 pb-2 opacity-0 transition-opacity duration-250 ease-house group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:hover)]:block"
          >
            <b className="block truncate text-caption font-semibold text-photo-ink">{item.templateName}</b>
            <small className="block truncate text-caption text-photo-ink/75">{meta}</small>
          </span>
        </span>
      </WorkLink>
      {live ? <MakeAgain templateId={item.templateId} jobId={item.id} /> : null}
    </div>
  )
}

// "Make again": the viewer on the creation form, opened from this work like the viewer's Make
// again: its settings and its kept photo (T40). The href stays the workspace page, for a new tab.
// Only where there is a pointer to hover with (a phone reaches it in the viewer), and not while
// works are being picked (the pick button covers the tile).
function MakeAgain({ templateId, jobId }: { templateId: string; jobId: string }) {
  const t = useTranslations('app.photos')
  return (
    <WorkLink
      workId={jobId}
      mode="again"
      href={makeAgainHref(templateId, jobId)}
      className="frost press absolute top-1.5 left-1.5 hidden min-h-8 items-center rounded-full px-3 text-caption font-medium text-photo-ink opacity-0 transition-opacity duration-250 ease-house group-hover:opacity-100 group-has-[button[aria-pressed]]:hidden focus-visible:opacity-100 [@media(hover:hover)]:inline-flex"
    >
      {t('makeAgain')}
    </WorkLink>
  )
}
