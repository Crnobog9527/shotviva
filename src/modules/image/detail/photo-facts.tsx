import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

import { INPUT_PREVIEW_PX } from '@/core/storage/rules'

import type { PhotoItem } from '../photos/photo-item'
import { workTagKey } from '../result/work-tag'
import { sizeLabel, tierName, tierPx } from '../workspace/workspace-options'
import { FormatRow } from './format-row'
import type { OriginalSource } from './photo-detail'
import { PhotoWhen } from './photo-when'

const ROW = 'flex min-h-11 items-baseline justify-between gap-3 py-2.5 [&+&]:border-t [&+&]:border-hairline'
const VISIBILITY = { freePublic: 'visibilityFree', private: 'visibilityPrivate', public: 'visibilityPublic' } as const

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={ROW}>
      <dt className="text-caption text-muted-foreground">{label}</dt>
      <dd className="text-right text-label">{children}</dd>
    </div>
  )
}

function originalFact(original: OriginalSource, f: (key: 'originalKept' | 'originalEdited' | 'originalDeleted', values?: { px: number }) => string) {
  if (original.kind === 'preview') return f('originalKept', { px: INPUT_PREVIEW_PX })
  return f(original.kind === 'source' ? 'originalEdited' : 'originalDeleted')
}

// The facts table (T6 photo.html, T32): what was made, how, for how much, and whether the
// upload's preview is still kept. Sizes and counts in mono, words in the sans.
export function PhotoFacts({ item, original }: { item: PhotoItem; original: OriginalSource }) {
  const t = useTranslations('app')
  const f = useTranslations('app.result.facts')
  const mono = (text: string) => <span className="font-mono text-caption">{text}</span>
  return (
    <dl aria-label={f('label')} className="hairline mt-5 rounded-panel bg-card px-4 py-1">
      <Row label={f('template')}>{item.templateName}</Row>
      <Row label={f('size')}>{mono(sizeLabel(item.aspect, t))}</Row>
      <Row label={f('resolution')}>{f('resolutionValue', { tier: tierName(item.resolution, t), px: tierPx(item.resolution) })}</Row>
      {item.fileUrl ? <FormatRow fileUrl={item.fileUrl} className={ROW} /> : null}
      <Row label={f('credits')}>{mono(t('credits', { count: item.credits }))}</Row>
      <Row label={f('visibility')}>{f(VISIBILITY[workTagKey(item.creditPool, item.visibility)])}</Row>
      <Row label={f('original')}>{originalFact(original, f)}</Row>
      <Row label={f('made')}>
        <PhotoWhen iso={item.createdAt} variant="made" />
      </Row>
    </dl>
  )
}
