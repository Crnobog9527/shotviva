'use client'

import { useTranslations } from 'next-intl'

import { buttonVariants } from '@/core/ui/button'
import { cn } from '@/core/ui/cn'

import { useZipDownload } from './use-zip-download'

type Props = { batchId: string; count: number; className?: string }

// Download ZIP for one batch (T107, Pro and Max): a quiet ghost button, never the screen's
// primary. The line under it says what is happening: packing (the route builds the archive,
// up to a few minutes for 30 photos), started, or wait a minute after three tries.
export function ZipButton({ batchId, count, className }: Props) {
  const t = useTranslations('app.batchZip')
  const errors = useTranslations('app.errors')
  const { state, start } = useZipDownload(batchId)
  const packing = state.kind === 'packing'
  const line =
    state.kind === 'packing' ? t('packing', { count })
    : state.kind === 'started' ? t('started')
    : state.kind === 'limited' ? t('limited')
    : state.kind === 'error' && state.code === 'NOT_FOUND' ? t('notFound')
    : state.kind === 'error' ? (errors.has(state.code) ? errors(state.code) : errors('fallback'))
    : null
  return (
    <div className={cn('flex flex-col', className)}>
      <button
        type="button"
        onClick={start}
        aria-busy={packing}
        disabled={packing}
        className={buttonVariants({ variant: 'glass', size: 'touch', className: 'gap-2 disabled:opacity-100' })}
      >
        {packing ? <Spinner /> : <ZipIcon />}
        <span>{packing ? t('packingCta') : t('cta', { count })}</span>
      </button>
      <p aria-live="polite" className={cn('text-caption leading-[1.4] text-muted-foreground', line ? 'mt-1.5' : 'sr-only')}>
        {line}
      </p>
    </div>
  )
}

function ZipIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4 flex-none" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 4v10M7.5 9.5 12 14l4.5-4.5M5 19h14" />
    </svg>
  )
}

function Spinner() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4 flex-none animate-spin text-primary motion-reduce:animate-none" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <path d="M12 3.5a8.5 8.5 0 1 1-8.5 8.5" />
    </svg>
  )
}
