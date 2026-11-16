'use client'

/* eslint-disable @next/next/no-img-element -- the optimiser's srcset on a plain <img> (coverImage), fitted whole */
import { useTranslations } from 'next-intl'
import dynamic from 'next/dynamic'
import { useState } from 'react'

import { coverImage } from '@/core/ui/cover-image'

import type { CatalogueTemplate } from '../../catalogue/catalogue-template'
import type { ViewerSide } from '../../catalogue/sample-viewer'

const SampleViewer = dynamic(() => import('../../catalogue/sample-viewer').then((m) => m.SampleViewer), { ssr: false })

type Props = { cover: CatalogueTemplate['cover'] | null; name: string }

// The poster dialog's sample: the template's cover pages side by side, whole (a poster is tall,
// so it is fitted, never cropped). Nothing when the template has no cover yet.
export function PosterSample({ cover, name }: Props) {
  const t = useTranslations('app.poster')
  const [side, setSide] = useState<ViewerSide | null>(null)
  const pages = ([{ src: cover?.before, side: 'phone', page: 1 }, { src: cover?.after, side: 'ai', page: 2 }] as const).filter((item) => Boolean(item.src))
  if (pages.length === 0) return <span className="hairline block aspect-[8/5] rounded-control bg-muted max-md:h-full" />
  return (
    <div className="flex aspect-[8/5] justify-center gap-2 rounded-control bg-wash-faint p-2 max-md:h-full max-md:aspect-auto">
      {pages.map(({ src, side: pageSide, page }) => (
        <button key={page} type="button" onClick={() => setSide(pageSide)} aria-label={t('sampleOpen', { name, page })} className="min-w-0 cursor-zoom-in">
          <img {...coverImage(src as string, '(min-width: 768px) 240px, 45vw')} alt={t('sampleAlt', { name, page })} className="h-full min-w-0 rounded-inner object-contain" />
        </button>
      ))}
      {side && cover ? <SampleViewer open onOpenChange={(open) => !open && setSide(null)} before={cover.before ?? cover.after ?? ''} after={cover.after ?? cover.before ?? ''} name={name} side={side} onSide={setSide} poster single={pages.length === 1} /> : null}
    </div>
  )
}
