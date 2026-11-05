'use client'

/* eslint-disable @next/next/no-img-element -- template covers and local photo previews */
import { estimatedProgress, percent } from '../generation/progress'
import { useNow } from '../workspace/use-now'
import { runningMeta, type PhotoItem } from './photo-item'
import { useRunningItems, type RunningRow } from './use-running-items'

// "In progress" (B comp photos.html): a developing tray per job, greyed thumbnail under the
// scan line, settings, an estimated bar and a safelight state dot. Hidden when empty.
export function RunningList({ server, covers }: { server: PhotoItem[]; covers: Record<string, string | null> }) {
  const rows = useRunningItems(server, covers)
  const now = useNow()
  if (rows.length === 0) return null
  return (
    <section aria-labelledby="run-h">
      <div className="mx-4 mt-6 mb-3 flex items-baseline justify-between gap-3">
        <h2 id="run-h" className="text-headline leading-[1.2] font-semibold tracking-[-0.01em]">In progress</h2>
        <span className="text-caption text-muted-foreground">Usually 20–40 seconds each</span>
      </div>
      <ul aria-live="polite" className="grid gap-3 px-4">
        {rows.map((row) => (
          <RunningRowView key={row.id} row={row} progress={estimatedProgress(now - row.startedAt)} />
        ))}
      </ul>
      <p className="mx-4 mt-3 text-caption text-muted-foreground">You can close the app. Finished photos land here.</p>
    </section>
  )
}

function RunningRowView({ row, progress }: { row: RunningRow; progress: number }) {
  const thumb = row.previewUrl ?? row.cover
  return (
    <li className="hairline grid grid-cols-[76px_1fr] items-center gap-4 rounded-media bg-card p-3">
      <span className="relative block aspect-[4/5] overflow-hidden rounded-inner bg-photo-ground">
        {thumb ? <img src={thumb} alt="" className="absolute inset-0 size-full object-cover brightness-75 grayscale" /> : null}
        <span aria-hidden="true" className="animate-scan absolute inset-x-0 top-[40%] h-0.5 bg-primary" />
      </span>
      <span className="min-w-0">
        <b className="block text-body font-semibold">{row.templateName}</b>
        <span className="mt-1 block text-caption leading-[1.3] text-muted-foreground">{runningMeta(row)}</span>
        <span
          role="progressbar"
          aria-label={`Generating ${row.templateName}`}
          aria-valuenow={percent(progress)}
          aria-valuemin={0}
          aria-valuemax={100}
          className="mt-3 block h-1 overflow-hidden rounded-full bg-wash-strong"
        >
          <span className="block h-full rounded-full bg-primary transition-[width] duration-1000" style={{ width: `${percent(progress)}%` }} />
        </span>
        <span className="mt-2 flex items-center gap-2 text-caption">
          <span aria-hidden="true" className="size-2 rounded-full bg-primary" />
          Generating
        </span>
      </span>
    </li>
  )
}
