'use client'

import { useTranslations } from 'next-intl'

import { coverImage } from '@/core/ui/cover-image'

import { etaProgress, isLate } from '../generation/eta'
import { useEta } from '../generation/eta-store'
import { NotifyButton } from '../generation/notify-button'
import { percent } from '../generation/progress'
import { GroundedImg } from '../result/grounded-img'
import { useNow } from '../workspace/use-now'
import { DAY_BAR, DAY_LABEL, GRID } from './grid'
import type { PhotoItem } from './photo-item'
import { useRunningItems, type RunningRow } from './use-running-items'

// Photos still developing, as the first tiles of Today (2026-11-28; they were a list of their own
// above the grid): a greyed tile under the scan line with an estimated bar, in the grid the
// finished photo will take its place in. Before them, one line across the grid: how long it
// usually takes and the notify switch. Nothing when none is running.
// today: the day's heading when the page has no Today section yet (no finished work today): the
// tiles then bring their own section; otherwise they are the first cells of the server's grid.
export function RunningList({ server, covers, today }: { server: PhotoItem[]; covers: Record<string, string | null>; today?: string }) {
  const t = useTranslations('app.photos')
  const rows = useRunningItems(server, covers)
  const now = useNow()
  if (rows.length === 0) return null
  const cells = (
    <>
      <li aria-live="polite" className="col-span-full flex flex-wrap items-center justify-between gap-x-4 gap-y-1 pb-1 text-caption text-muted-foreground">
        <span>{t('developing', { count: rows.length })} · {t('usually')}</span>
        <NotifyButton />
      </li>
      {rows.map((row) => (
        <RunningTile key={row.id} row={row} now={now} />
      ))}
    </>
  )
  if (today === undefined) return cells
  return (
    <section aria-label={today}>
      <div className={DAY_BAR}>
        <div className={DAY_LABEL}>
          <h3 className="text-body leading-[1.25] font-semibold">{today}</h3>
        </div>
      </div>
      <ul className={GRID}>{cells}</ul>
    </section>
  )
}

// Each photo its own bar (a two-page poster is two tiles), by its template's usual time (eta.ts).
function RunningTile({ row, now }: { row: RunningRow; now: number }) {
  const t = useTranslations('app')
  const eta = useEta(row)
  const elapsed = now - row.startedAt
  const progress = row.queued ? 0 : etaProgress(elapsed, eta)
  const late = !row.queued && isLate(elapsed, eta)
  const thumb = row.previewUrl ?? row.cover
  return (
    <li>
      <span className="hairline relative block aspect-[4/5] overflow-hidden rounded-inner bg-photo-ground">
        {/* The template cover stands in until this tab has the photo; a cut-out cover sits on white. */}
        {thumb ? <GroundedImg ground="white" {...coverImage(thumb, '180px')} alt="" className="absolute inset-0 size-full object-cover brightness-[.6] grayscale" /> : null}
        {row.queued ? null : <span aria-hidden="true" className="animate-scan absolute inset-x-0 top-[40%] h-0.5 bg-primary" />}
        <span className="absolute inset-x-0 bottom-0 bg-linear-to-t from-(--photo-fade) to-transparent px-2 pt-8 pb-2">
          <span className="block truncate text-caption font-medium text-photo-ink">{t(row.queued ? 'photos.waiting' : late ? 'wait.photosLate' : 'photos.generating')}</span>
          <span
            role="progressbar"
            aria-label={t('photos.generatingAria', { name: row.templateName })}
            aria-valuenow={percent(progress)}
            aria-valuemin={0}
            aria-valuemax={100}
            className="mt-1.5 block h-1 overflow-hidden rounded-full bg-photo-ink/25"
          >
            <span className="block h-full rounded-full bg-primary transition-[width] duration-1000" style={{ width: `${percent(progress)}%` }} />
          </span>
        </span>
      </span>
    </li>
  )
}
