'use client'

import { useTranslations } from 'next-intl'

import { cn } from '@/core/ui/cn'

import { Arrive, Develop } from './demo-parts'
import { batchCounts } from './feature-access'
import { BATCH_PAIRS } from './intro-media'
import { linear, useCountUp } from './use-playback'

const UPLOAD_MS = 1100
const DEVELOP_MS = 2500
const DEVELOP_STAGGER = 380

// The e-commerce batch at Max size (Owner 2026-11-12): 30 product photos arrive, one template
// is picked, the whole batch develops together, and one ZIP holds them all. Five real photos
// stand for the batch; the rest is a count, never copies of the same five.
export function BatchScene({ phase, reduce }: { phase: number; reduce: boolean }) {
  const t = useTranslations('app.gated.batch.demo')
  const total = batchCounts().max
  const uploaded = useCountUp(total, UPLOAD_MS, phase >= 1, reduce)
  const done = useCountUp(total, DEVELOP_MS, phase >= 3, reduce, linear)
  return (
    <div className="grid gap-3">
      <div className="flex min-h-8 items-center justify-between gap-2">
        <span className="text-caption text-bone-dim tabular-nums">{t('photos', { count: uploaded })}</span>
        <Arrive on={phase >= 2}>
          <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-wash-strong px-3 text-caption font-semibold text-foreground">
            <Check />
            {t('template')}
          </span>
        </Arrive>
      </div>
      <ul className="grid grid-cols-3 gap-2">
        {BATCH_PAIRS.map((pair, index) => (
          <li key={pair.phone}>
            <Arrive on={phase >= 1} delay={index * 90}>
              <Develop phone={pair.phone} result={pair.result} developed={phase >= 3} delay={index * DEVELOP_STAGGER} />
            </Arrive>
          </li>
        ))}
        <li>
          <Arrive on={phase >= 1} delay={BATCH_PAIRS.length * 90} className="h-full">
            <span className="hairline grid aspect-[4/5] place-items-center rounded-[10px] bg-card font-display text-[28px] leading-none text-bone-dim">
              {t('more', { count: total - BATCH_PAIRS.length })}
            </span>
          </Arrive>
        </li>
      </ul>
      <Finish phase={phase} done={done} total={total} />
    </div>
  )
}

// Progress while the batch develops, then the one ZIP that holds it (Pro and Max both have it).
function Finish({ phase, done, total }: { phase: number; done: number; total: number }) {
  const t = useTranslations('app.gated.batch.demo')
  const ready = phase >= 4
  return (
    <div className="relative h-11">
      <div className={cn('absolute inset-0 grid content-center gap-1.5 transition-opacity duration-300 motion-reduce:transition-none', ready || phase < 3 ? 'opacity-0' : 'opacity-100')}>
        <span className="text-caption text-bone-dim tabular-nums">{t('progress', { done, total })}</span>
        <span className="h-1 overflow-hidden rounded-full bg-wash-strong">
          <span className="block h-full rounded-full bg-primary" style={{ width: `${(done / total) * 100}%` }} />
        </span>
      </div>
      <Arrive on={ready} className="absolute inset-0">
        <span className="flex h-11 items-center justify-between gap-2 rounded-[12px] bg-wash-strong px-3">
          <span className="flex min-w-0 items-center gap-2 text-caption font-semibold text-foreground">
            <ZipIcon />
            <span className="truncate">{t('zip', { count: total })}</span>
          </span>
          <span className="grid size-8 flex-none place-items-center rounded-full bg-primary text-primary-foreground">
            <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
            </svg>
          </span>
        </span>
      </Arrive>
    </div>
  )
}

function Check() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-3.5 text-primary" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  )
}

function ZipIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5 flex-none text-bone-dim" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinejoin="round">
      <path d="M6 3h8l4 4v14H6z" />
      <path d="M11 3v2h2v2h-2v2h2v2h-2v2" strokeLinecap="round" />
      <rect x="10" y="14" width="4" height="4" rx="1" />
    </svg>
  )
}
