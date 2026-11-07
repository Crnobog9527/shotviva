'use client'

import { useTranslations } from 'next-intl'
import { useRef } from 'react'

import { LoopPlate } from './card-media'
import { hasStills, type CatalogueTemplate } from './catalogue-template'
import { useCategoryLabel } from './category-label'
import { PairMedia } from './pair-media'
import { useHoverWipe } from './use-hover-wipe'

// The featured card at the top of Create (B comp create.html .feature): the first video
// template as the same live pair as every card, 8:5 on phones and 8:3 from md up, its loop
// playing on the right plate on hover (once in view on touch). Its name sits over a dark fade
// with a frosted "Make one" pill: a tap opens the creation dialog.
export function FeatureCard({ template, onOpen }: { template: CatalogueTemplate; onOpen(id: string): void }) {
  const t = useTranslations('app.template')
  const label = useCategoryLabel()
  const ref = useRef<HTMLButtonElement>(null)
  useHoverWipe(ref)
  const { before, after, motion } = template.cover
  const alt = t('cardAlt', { name: template.name })
  return (
    <button
      ref={ref}
      type="button"
      aria-haspopup="dialog"
      aria-label={t('featureAria', { name: template.name, category: label(template.category) })}
      onClick={() => onOpen(template.id)}
      className="group hairline relative mt-4 block w-full overflow-hidden rounded-panel bg-card text-left transition-shadow hover:shadow-[inset_0_0_0_1px_var(--input)] md:mt-6"
    >
      {hasStills(template) ? (
        <PairMedia before={before as string} after={after as string} alt={alt} eager video={motion ?? undefined} size="feature" className="rounded-panel md:aspect-[8/3]" />
      ) : (
        <LoopPlate template={template} alt={alt} className="rounded-panel md:aspect-[8/3]" />
      )}
      <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 z-5 h-[56%] bg-[linear-gradient(180deg,transparent,var(--photo-fade))]" />
      <span className="absolute inset-x-4 bottom-4 z-6 flex items-end justify-between gap-3 md:inset-x-6 md:bottom-6">
        <span>
          <b className="block font-display text-h1 leading-none font-normal tracking-[-0.02em] text-photo-ink">{template.name}</b>
          <small className="mt-1 block text-caption text-bone-dim">{t('featureMeta', { category: label(template.category) })}</small>
        </span>
        <span className="frost inline-flex min-h-9 flex-none items-center gap-0.5 rounded-full px-3.5 text-caption leading-none font-semibold text-photo-ink shadow-[inset_0_0_0_1px_var(--input)]">
          {t('makeOne')}
          <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4 text-primary" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 6l6 6-6 6" />
          </svg>
        </span>
      </span>
    </button>
  )
}
