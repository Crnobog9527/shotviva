'use client'

import { useTranslations } from 'next-intl'
import dynamic from 'next/dynamic'
import { useState, type MouseEvent } from 'react'

import { cn } from '@/core/ui/cn'

import { hasStills, type CatalogueTemplate } from './catalogue-template'
import type { ViewerSide } from './sample-viewer'
import { isCompareSample, TemplateSample, type SampleTemplate } from './template-sample'

// Fetched on the first open only (scripts/js-budget.json).
const SampleViewer = dynamic(() => import('./sample-viewer').then((m) => m.SampleViewer), { ssr: false })

type Props = { template: SampleTemplate & Pick<CatalogueTemplate, 'name'>; className?: string }

// The creation dialog's sample, opened full screen (SampleViewer). The pair is one big tap target
// (the half tapped is the side that opens); the drag compare keeps its drag, so it opens from the
// corner button only. A motion-only template has no stills to show and stays as it was.
export function ZoomableSample({ template, className }: Props) {
  const t = useTranslations('app.template')
  const [side, setSide] = useState<ViewerSide | null>(null)
  const sample = <TemplateSample template={template} className={className} />
  if (!hasStills(template)) return sample
  const compare = isCompareSample(template)
  const openAt = (event: MouseEvent<HTMLElement>) => {
    const box = event.currentTarget.getBoundingClientRect()
    setSide(event.clientX - box.left < box.width / 2 ? 'phone' : 'ai')
  }
  return (
    <>
      {sample}
      {compare ? null : <button type="button" aria-label={t('viewerOpen', { name: template.name })} onClick={openAt} className="absolute inset-0 z-4 rounded-media" />}
      <button
        type="button"
        aria-label={t('viewerOpen', { name: template.name })}
        onClick={() => setSide('ai')}
        className={cn('frost press absolute z-5 grid size-9 place-items-center rounded-full text-white', compare ? 'bottom-3 left-3' : 'top-3 left-3')}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
        </svg>
      </button>
      {side === null ? null : <SampleViewer
        open
        onOpenChange={(open) => !open && setSide(null)}
        before={template.cover.before as string}
        after={template.cover.after as string}
        name={template.name}
        side={side}
        onSide={setSide}
      />}
    </>
  )
}
