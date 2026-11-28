'use client'

import dynamic from 'next/dynamic'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { REPLAY_BLOCK_CLASS } from '@/core/analytics/browser'

import type { PhotoItem } from '../photo-item'
import type { DeleteCompanyWork } from './colleague-viewer'

// The viewer loads on the first tap, not with Photos (scripts/js-budget.json).
const ColleagueViewer = dynamic(() => import('./colleague-viewer').then((mod) => mod.ColleagueViewer), { ssr: false })

// A colleague's work on Photos' company view: the same tile as the reader's own, but a button
// that opens the company viewer (the picture, who made it, download; delete for the org owner).
// It is not the reader's work, so there is no edit, Make again or share, and it is never picked
// for a share link. remove: the owner's delete action, null for staff.
export function ColleagueCard({ item, eager, remove }: { item: PhotoItem; eager: boolean; remove: DeleteCompanyWork | null }) {
  const t = useTranslations('app.photos')
  const [open, setOpen] = useState(false)
  // Mounted on the first open and kept, so the sheet can animate out.
  const [seen, setSeen] = useState(false)
  return (
    <div className="group relative">
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => {
          setSeen(true)
          setOpen(true)
        }}
        className="press block w-full rounded-inner text-left"
      >
        <span className="relative block aspect-[4/5] overflow-hidden rounded-inner bg-muted">
          {/* A signed R2 redirect per request, owner-checked by the route: not a static asset. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={item.thumbUrl ?? undefined}
            alt={t('photoAlt', { name: item.templateName })}
            width={480}
            height={600}
            loading={eager ? 'eager' : 'lazy'}
            decoding="async"
            className={`${REPLAY_BLOCK_CLASS} absolute inset-0 size-full object-cover transition-transform duration-600 ease-house group-hover:scale-[1.03]`}
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 hidden bg-linear-to-t from-(--photo-fade) to-transparent px-2.5 pt-10 pb-2 opacity-0 transition-opacity duration-250 ease-house group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:hover)]:block"
          >
            <b className="block truncate text-caption font-semibold text-photo-ink">{item.templateName}</b>
            <small className="block truncate text-caption text-photo-ink/75">{makerName(item, t)}</small>
          </span>
        </span>
      </button>
      {seen ? <ColleagueViewer item={item} open={open} onOpenChange={setOpen} remove={remove} /> : null}
    </div>
  )
}

type T = ReturnType<typeof useTranslations<'app.photos'>>

// "Li Lei", "Li Lei · left", "Deleted member", or the plain word for an account with no label.
export function makerName(item: PhotoItem, t: T): string {
  const maker = item.maker
  if (!maker || maker.state === 'deleted') return t('company.deleted')
  const who = maker.who ?? t('company.unknown')
  return maker.state === 'removed' ? t('company.left', { who }) : who
}
