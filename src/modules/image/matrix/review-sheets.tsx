'use client'

import { useTranslations } from 'next-intl'

import { BulkNoteSheet } from './bulk-note-sheet'
import { cellTier } from './cell-choices'
import { CoverZoom } from './cover-zoom'
import { totalsByResolution } from './matrix-state'
import { TierSheet } from './tier-sheet'
import type { MatrixDraft } from './use-matrix-draft'
import type { ReviewList } from './use-review-list'

// The review list's two sheets: a tier for one result or for the whole batch, and the larger look
// at a result's template.
export function ReviewSheets({ draft, list }: { draft: MatrixDraft; list: ReviewList }) {
  return (
    <>
      {list.tierFor === 'batch' ? <BatchTierSheet draft={draft} list={list} /> : null}
      {list.tierFor === 'selection' ? <SelectionTierSheet draft={draft} list={list} /> : null}
      {list.tierFor && list.tierFor !== 'batch' && list.tierFor !== 'selection' ? <CellTierSheet key={list.tierFor} draft={draft} list={list} /> : null}
      {list.noteOpen ? <BulkNoteSheet cells={draft.cells.filter((cell) => list.bulk.selected.has(cell.key))} onClose={() => list.setNoteOpen(false)} onApply={list.noteSelected} /> : null}
      <CoverZoom rows={list.rows} at={list.zoomAt} onAt={list.setZoomAt} />
    </>
  )
}

function CellTierSheet({ draft, list }: { draft: MatrixDraft; list: ReviewList }) {
  const t = useTranslations('app.matrix.review')
  const row = list.rows.find((r) => r.cell.key === list.tierFor)
  if (!row) return null
  const { cell } = row
  const close = () => list.setTierFor(null)
  const others = draft.cells.filter((other) => other.template.id === cell.template.id && other.key !== cell.key && !other.removed).length
  return (
    <TierSheet
      open
      onOpenChange={(open) => !open && close()}
      title={t('tierTitle', { index: row.index + 1 })}
      description={`${cell.template.name}${row.photo.name ? ` · ${row.photo.name}` : ''}. ${t('tierHint')}`}
      choices={cell.tiers.map((tier) => ({ tier, credits: cell.template.creditsCost[tier] }))}
      current={cell.tier}
      promo={draft.promo}
      others={others}
      removed={cell.removed}
      onPick={(tier, also) => {
        if (cell.removed) list.skip(cell.key, false)
        list.pickTier(cell.key, tier, also)
        close()
      }}
      onSkip={(skip) => {
        list.skip(cell.key, skip)
        close()
      }}
    />
  )
}

function BatchTierSheet({ draft, list }: { draft: MatrixDraft; list: ReviewList }) {
  const t = useTranslations('app.matrix.review')
  const totals = totalsByResolution(draft.cells)
  const close = () => list.setTierFor(null)
  return (
    <TierSheet
      open
      onOpenChange={(open) => !open && close()}
      title={t('batchTierTitle')}
      description={t('batchTierLine')}
      choices={draft.options.resolutions.map((tier) => ({ tier, credits: totals[tier] }))}
      current={draft.values.resolution}
      promo={draft.promo}
      onPick={(tier) => {
        list.pickTier('batch', tier, false)
        close()
      }}
    />
  )
}

// The picked results' tier: every tier any of them offers, each priced as the picked results
// would cost at it (each takes the nearest tier its template sells).
function SelectionTierSheet({ draft, list }: { draft: MatrixDraft; list: ReviewList }) {
  const t = useTranslations('app.matrix.review')
  const picked = draft.cells.filter((cell) => list.bulk.selected.has(cell.key))
  const tiers = draft.options.resolutions.filter((tier) => picked.some((cell) => cell.tiers.includes(tier)))
  const cost = (tier: (typeof tiers)[number]) => picked.reduce((sum, cell) => sum + cell.template.creditsCost[cellTier(tier, cell.tiers) ?? tier], 0)
  const close = () => list.setTierFor(null)
  const single = new Set(picked.map((cell) => cell.tier))
  return (
    <TierSheet
      open
      onOpenChange={(open) => !open && close()}
      title={t('bulkTierTitle', { count: picked.length })}
      description={t('bulkTierLine')}
      choices={tiers.map((tier) => ({ tier, credits: cost(tier) }))}
      current={single.size === 1 ? [...single][0]! : null}
      promo={draft.promo}
      onPick={(tier) => {
        list.pickTier('selection', tier, false)
        close()
      }}
    />
  )
}
