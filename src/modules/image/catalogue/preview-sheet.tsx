'use client'

/* eslint-disable @next/next/no-img-element -- covers on the public assets bucket */
import { Link } from '@/core/i18n/ui'
import { useTranslations } from 'next-intl'
import { useRef } from 'react'

import { buttonVariants } from '@/core/ui/button'
import { ResponsiveSheet } from '@/core/ui/responsive-sheet'
import { useMediaQuery } from '@/core/ui/use-media-query'

import { isMotion, type CatalogueTemplate } from './catalogue-template'
import { useCategoryLabel } from './category-label'
import { CompareSlider } from './compare-slider'
import { REDUCED_MOTION, useQuietLoop } from './use-motion'

const TIERS = ['1k', '2k', '3k'] as const

// Template preview (DESIGN §4.2): bottom sheet on phones, dialog on desktop. The compare slider
// (or the loop), one hint line, the three prices, and "Use this template" into the workspace.
export function PreviewSheet({ template, onClose }: { template: CatalogueTemplate | null; onClose(): void }) {
  const label = useCategoryLabel()
  return (
    <ResponsiveSheet
      open={template !== null}
      onOpenChange={(open) => !open && onClose()}
      title={template?.name ?? ''}
      description={template ? (template.description ?? label(template.category)) : ''}
    >
      {template ? <PreviewBody template={template} onUse={onClose} /> : null}
    </ResponsiveSheet>
  )
}

// Closing on "Use this template" matters: Next keeps the Create page's state for the way back.
function PreviewBody({ template, onUse }: { template: CatalogueTemplate; onUse(): void }) {
  const t = useTranslations('app')
  return (
    <>
      <div className="mt-4">
        <PreviewMedia template={template} />
      </div>
      <p className="mt-2 text-caption text-muted-foreground">
        {t(isMotion(template) ? 'template.hintMotion' : 'template.hintCompare')}
      </p>
      <dl className="mt-4 mb-4 grid grid-cols-3 gap-2">
        {TIERS.map((id) => (
          <div key={id} className="hairline rounded-inner bg-wash-faint px-3 py-2">
            <dt className="text-caption text-muted-foreground">{t(`tiers.${id}.name`)}</dt>
            <dd className="mt-1 font-mono text-caption leading-none">{t('credits', { count: template.creditsCost[id] })}</dd>
          </div>
        ))}
      </dl>
      <Link href={`/generate/${template.id}`} onClick={onUse} className={buttonVariants({ variant: 'cta', size: 'cta' })}>
        {t('template.use')}
      </Link>
    </>
  )
}

function PreviewMedia({ template }: { template: CatalogueTemplate }) {
  const t = useTranslations('app.template')
  const { before, after, motion, poster } = template.cover
  if (isMotion(template)) {
    return template.cover.type === 'video' ? (
      <PreviewLoop src={motion as string} poster={poster as string} name={template.name} />
    ) : (
      <PreviewAnimated src={motion as string} poster={poster as string} name={template.name} />
    )
  }
  if (!before || !after) return <div className="aspect-[4/5] rounded-media bg-muted" />
  return <CompareSlider before={before} after={after} afterAlt={t('resultAlt', { name: template.name })} badge={t('example')} />
}

function PreviewLoop({ src, poster, name }: { src: string; poster: string; name: string }) {
  const t = useTranslations('app.template')
  const ref = useRef<HTMLVideoElement>(null)
  useQuietLoop(ref, src)
  return (
    <div className="relative aspect-[4/5] overflow-hidden rounded-media bg-muted">
      <video ref={ref} poster={poster} muted loop playsInline preload="none" aria-label={t('loopAria', { name })} className="absolute inset-0 size-full object-cover" />
      <ExampleBadge />
    </div>
  )
}

function PreviewAnimated({ src, poster, name }: { src: string; poster: string; name: string }) {
  const t = useTranslations('app.template')
  const reduce = useMediaQuery(REDUCED_MOTION)
  return (
    <div className="relative aspect-[4/5] overflow-hidden rounded-media bg-muted">
      <img src={reduce ? poster : src} alt={t('animationAlt', { name })} className="absolute inset-0 size-full object-cover" />
      <ExampleBadge />
    </div>
  )
}

function ExampleBadge() {
  const t = useTranslations('app.template')
  return <span className="frost absolute bottom-3 left-3 inline-flex h-[26px] items-center rounded-tag px-2 text-caption leading-none font-medium text-photo-ink">{t('example')}</span>
}
