'use client'

import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

import { cn } from '@/core/ui/cn'
import { EmptyState, STATE_GHOST } from '@/core/ui/empty-state'

import { ZipButtonLazy as ZipButton } from '../../batch/zip-button-lazy'
import type { PhotoItem } from '../photo-item'

export type Steps = { index: number; count: number; go(delta: -1 | 1): void } | null

// Previous / next over the tray's sides (from md): 44px frost discs, hidden at either end.
export function TraySteps({ steps }: { steps: Steps }) {
  const t = useTranslations('app.photos.viewer')
  if (!steps) return null
  return (
    <>
      <span aria-hidden="true" className="frost pointer-events-none absolute top-4 left-4 hidden min-h-[26px] items-center rounded-full px-2.5 font-mono text-caption leading-none text-foreground md:inline-flex">
        {steps.index + 1} / {steps.count}
      </span>
      {steps.index > 0 ? <StepButton delta={-1} label={t('previous')} onStep={steps.go} className="left-3" /> : null}
      {steps.index < steps.count - 1 ? <StepButton delta={1} label={t('next')} onStep={steps.go} className="right-3" /> : null}
    </>
  )
}

function StepButton({ delta, label, onStep, className }: { delta: -1 | 1; label: string; onStep(delta: -1 | 1): void; className: string }) {
  return (
    <button type="button" aria-label={label} onClick={() => onStep(delta)} className={cn('press absolute top-1/2 z-10 hidden size-11 -translate-y-1/2 place-items-center rounded-full md:grid', className)}>
      <span className="frost grid size-9 place-items-center rounded-full text-foreground">
        <Chevron delta={delta} />
      </span>
    </button>
  )
}

// The drawer's top row on phones: ‹ 3 / 24 › (a swipe on the photo does the same).
export function PhoneSteps({ steps }: { steps: Steps }) {
  const t = useTranslations('app.photos.viewer')
  if (!steps) return null
  const button = (delta: -1 | 1, label: string, off: boolean) => (
    <button type="button" aria-label={label} disabled={off} onClick={() => steps.go(delta)} className="press grid size-11 place-items-center rounded-full text-foreground disabled:text-muted-foreground/50">
      <Chevron delta={delta} />
    </button>
  )
  return (
    <div className="flex items-center">
      {button(-1, t('previous'), steps.index === 0)}
      <span className="min-w-14 text-center font-mono text-caption text-muted-foreground">
        <span aria-hidden="true">
          {steps.index + 1} / {steps.count}
        </span>
        <span className="sr-only">{t('position', { index: steps.index + 1, count: steps.count })}</span>
      </span>
      {button(1, t('next'), steps.index === steps.count - 1)}
    </div>
  )
}

// Back from the edit or Make again form to the work (the top row on phones, the side column's
// top from md).
export function BackToWork({ onBack, className }: { onBack(): void; className?: string }) {
  const t = useTranslations('app.photos.viewer')
  return (
    <button type="button" onClick={onBack} className={cn('press inline-flex min-h-11 items-center gap-0.5 rounded-control pr-2 text-label font-medium text-foreground', className)}>
      <Chevron delta={-1} />
      {t('back')}
    </button>
  )
}

function Chevron({ delta }: { delta: -1 | 1 }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d={delta < 0 ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6'} />
    </svg>
  )
}

// Where the work sits in its batch (T107), with the batch's ZIP when it has paid photos: the
// grid's batch band, carried into the viewer.
export function BatchLine({ item, items }: { item: PhotoItem; items: readonly PhotoItem[] }) {
  const t = useTranslations('app.photos.viewer')
  const members = item.batchId ? items.filter((other) => other.batchId === item.batchId) : []
  if (members.length < 2 || !item.batchId) return null
  const paid = members.filter((member) => member.creditPool === 'paid').length
  return (
    <div className="hairline mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-panel bg-card px-3 py-2.5">
      <p className="text-caption leading-[1.4] text-muted-foreground">{t('batch', { index: members.findIndex((member) => member.id === item.id) + 1, count: members.length })}</p>
      {paid > 0 ? <ZipButton batchId={item.batchId} count={paid} className="max-w-full" /> : null}
    </div>
  )
}

// A work that is not there (deleted, someone else's, a bad link), or a read that failed.
export function ViewerMessage({ kind, onClose, onRetry }: { kind: 'missing' | 'error'; onClose(): void; onRetry(): void }) {
  const missing = useTranslations('app.states.photoMissing')
  const t = useTranslations('app.photos.viewer')
  const action: ReactNode =
    kind === 'missing' ? (
      <button type="button" onClick={onClose} className={STATE_GHOST}>
        {missing('back')}
      </button>
    ) : (
      <button type="button" onClick={onRetry} className={STATE_GHOST}>
        {t('retry')}
      </button>
    )
  return (
    <div className="grid min-h-0 flex-1 place-items-center overflow-y-auto px-4 pb-[calc(var(--sab)+24px)]">
      <EmptyState icon="missing" title={kind === 'missing' ? missing('title') : t('failed')} body={kind === 'missing' ? missing('body') : t('failedBody')} action={action} />
    </div>
  )
}
