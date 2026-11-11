'use client'

/* eslint-disable @next/next/no-img-element -- local photo previews and template covers */
import { useTranslations } from 'next-intl'

import { REPLAY_BLOCK_CLASS } from '@/core/analytics/browser'
import { cn } from '@/core/ui/cn'

import type { CatalogueTemplate } from '../catalogue/catalogue-template'
import type { BatchPhoto } from '../workspace/photo-batch'
import { cellKey, MATRIX_MAX_CELLS, type CellKey, type MatrixCell } from './matrix-state'

type Props = { templates: readonly CatalogueTemplate[]; photos: readonly BatchPhoto[]; cells: readonly MatrixCell[]; total: number; count: number; onToggle(key: CellKey): void }

// The batch before it runs (T107): photos down, templates across, each square one photo the
// batch will make with its credits. Tapping a square leaves it out (and back in). The line under
// it is the total, which is what Generate charges.
export function MatrixGrid({ templates, photos, cells, total, count, onToggle }: Props) {
  const t = useTranslations('app.matrix')
  const byKey = new Map(cells.map((cell) => [cell.key, cell]))
  const columns = { gridTemplateColumns: `2.75rem repeat(${templates.length}, minmax(0, 1fr))` }
  return (
    <div className="hairline-lit rounded-panel bg-card p-2.5">
      <div role="table" aria-label={t('gridLabel')} className="grid gap-1.5">
        <div role="row" className="grid items-end gap-1.5" style={columns}>
          {/* Holds the photo column's place: an sr-only cell leaves the grid flow and would pull every template header one column left. */}
          <span role="columnheader">
            <span className="sr-only">{t('gridPhoto')}</span>
          </span>
          {templates.map((template) => (
            <span role="columnheader" key={template.id} className="min-w-0 text-center">
              <TemplateThumb template={template} />
              <span className="mt-1 block truncate text-caption leading-tight text-muted-foreground">{template.name}</span>
            </span>
          ))}
        </div>
        {photos.map((photo, index) => (
          <div role="row" key={photo.id} className="grid items-stretch gap-1.5" style={columns}>
            <span role="rowheader" className="relative block aspect-[4/5] overflow-hidden rounded-[8px] bg-muted">
              <img src={photo.url} alt={t('photoN', { index: index + 1 })} className={cn(REPLAY_BLOCK_CLASS, 'size-full object-cover')} />
            </span>
            {templates.map((template) => {
              const cell = byKey.get(cellKey(template.id, photo.id))
              return cell ? <CellButton key={cell.key} cell={cell} index={index + 1} onToggle={() => onToggle(cell.key)} /> : <span key={template.id} />
            })}
          </div>
        ))}
      </div>
      <p aria-live="polite" className="mt-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-1 text-caption text-muted-foreground">
        <b className={cn('font-medium', count > MATRIX_MAX_CELLS ? 'text-destructive' : 'text-foreground')}>
          {t.rich('gridTotal', { count, max: MATRIX_MAX_CELLS, total, mono: (chunks) => <span className="font-mono">{chunks}</span> })}
        </b>
        <span>{t('gridHint')}</span>
      </p>
    </div>
  )
}

function CellButton({ cell, index, onToggle }: { cell: MatrixCell; index: number; onToggle(): void }) {
  const t = useTranslations('app.matrix')
  const label = t(cell.removed ? 'cellOff' : 'cellOn', { index, template: cell.template.name, count: cell.credits })
  return (
    <span role="cell" className="grid">
      <button
        type="button"
        aria-pressed={!cell.removed}
        aria-label={label}
        onClick={onToggle}
        className={cn(
          'press grid min-h-11 place-items-center rounded-[8px] font-mono text-caption transition-[background,box-shadow]',
          cell.removed ? 'text-muted-foreground shadow-[inset_0_0_0_1px_var(--input)] [background:repeating-linear-gradient(135deg,transparent_0_6px,var(--wash)_6px_8px)]' : 'chosen text-foreground',
        )}
      >
        {cell.removed ? (
          <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
            <path d="M7 7l10 10M17 7 7 17" />
          </svg>
        ) : (
          <span aria-hidden="true">{cell.credits}</span>
        )}
      </button>
    </span>
  )
}

function TemplateThumb({ template }: { template: CatalogueTemplate }) {
  const cover = template.cover.after ?? template.cover.poster
  return (
    <span className="hairline relative mx-auto block aspect-square w-full max-w-11 overflow-hidden rounded-[8px] bg-muted">
      {cover ? <img src={cover} alt="" loading="lazy" decoding="async" className="absolute inset-0 size-full object-cover" /> : null}
    </span>
  )
}
