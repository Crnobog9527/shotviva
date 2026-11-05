'use client'

import { useTranslations } from 'next-intl'
import { useRef } from 'react'

import type { CatalogueTemplate } from './catalogue-template'
import { MotionBadge } from './split-tags'
import { useQuietLoop } from './use-motion'

// The 16:10 featured card at the top of Create: the first video template, playing its loop
// while in view, with its name over a dark fade and a "Preview" pill.
export function FeatureCard({ template, onOpen }: { template: CatalogueTemplate; onOpen(id: string): void }) {
  const t = useTranslations('app.template')
  const ref = useRef<HTMLVideoElement>(null)
  useQuietLoop(ref, template.cover.motion ?? '')
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-label={t('featureAria', { name: template.name, category: template.category })}
      onClick={() => onOpen(template.id)}
      className="press hairline relative mx-4 mt-4 block aspect-[16/10] w-[calc(100%-32px)] overflow-hidden rounded-panel bg-card text-left"
    >
      <video ref={ref} poster={template.cover.poster ?? undefined} muted loop playsInline preload="none" aria-hidden="true" className="absolute inset-0 size-full object-cover" />
      <span aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(180deg,transparent_40%,var(--photo-fade))]" />
      <MotionBadge type="video" />
      <span className="frost absolute top-3 right-3 z-2 inline-flex h-[26px] items-center rounded-tag px-2 text-caption leading-none font-medium text-photo-ink">
        {t('example')}
      </span>
      <span className="absolute inset-x-4 bottom-4 z-2 flex items-end justify-between gap-3">
        <span>
          <b className="block font-display text-[30px] leading-none font-normal text-photo-ink">{template.name}</b>
          <small className="mt-1 block text-caption text-photo-ink/80">{t('featureMeta', { category: template.category })}</small>
        </span>
        <span className="inline-flex min-h-9 flex-none items-center rounded-full bg-photo-ink px-4 py-2 text-caption leading-none font-semibold text-background">{t('preview')}</span>
      </span>
    </button>
  )
}
