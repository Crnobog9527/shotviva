'use client'

/* eslint-disable @next/next/no-img-element -- small static demo images, described by the stage's label */
import { useTranslations } from 'next-intl'

import { Arrive, Develop } from './demo-parts'
import { CELL_STAGGER, TEMPLATE_KEYS, type MatrixRow } from './intro-media'

// Photos down the side, templates across the top, one result where each meets (the way the
// multi-template workspace lays out a batch). One row is "one photo × several templates"; two
// rows are the matrix. Cells develop in reading order, then the sum is shown.
export function MatrixScene({ rows, shown, phase }: { rows: readonly MatrixRow[]; shown: number; phase: number }) {
  const t = useTranslations('app.gated.templates.demo')
  return (
    <div className="grid grid-cols-4 gap-2">
      <span className="self-end pb-1 text-caption leading-[1.2] text-muted-foreground">{t('photo')}</span>
      {TEMPLATE_KEYS.map((key, column) => (
        <Arrive key={key} on={phase >= 1} delay={80 + column * 70} className="self-end">
          <span className="line-clamp-2 text-caption leading-[1.2] font-semibold [overflow-wrap:anywhere] text-foreground">{t(`names.${key}`)}</span>
        </Arrive>
      ))}
      {/* Every row keeps its room, so the tray holds one height for both ways of using it. */}
      {rows.map((row, rowIndex) => (rowIndex < shown ? <Row key={row.phone} row={row} rowIndex={rowIndex} phase={phase} /> : <Spacer key={row.phone} />))}
      <Arrive on={phase >= 3} className="col-span-full pt-1">
        <span className="text-caption text-bone-dim tabular-nums">{t('sum', { photos: shown, templates: TEMPLATE_KEYS.length, count: shown * TEMPLATE_KEYS.length })}</span>
      </Arrive>
    </div>
  )
}

function Spacer() {
  return (
    <span aria-hidden="true" className="col-span-full grid grid-cols-4 gap-2">
      <span className="aspect-[4/5]" />
    </span>
  )
}

function Row({ row, rowIndex, phase }: { row: MatrixRow; rowIndex: number; phase: number }) {
  return (
    <>
      <Arrive on={phase >= 1} delay={rowIndex * 90}>
        <span className="relative block aspect-[4/5] overflow-hidden rounded-[10px] bg-muted">
          <img src={row.phone} alt="" decoding="async" className="absolute inset-0 size-full object-cover" />
          <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-[10px] shadow-[inset_0_0_0_1px_var(--border)]" />
        </span>
      </Arrive>
      {TEMPLATE_KEYS.map((key, column) => (
        <Arrive key={key} on={phase >= 1} delay={120 + (rowIndex * 3 + column) * 60}>
          <Develop
            phone={row.phone}
            result={row.results[key]}
            developed={phase >= 2}
            delay={(rowIndex * TEMPLATE_KEYS.length + column) * CELL_STAGGER}
          />
        </Arrive>
      ))}
    </>
  )
}
