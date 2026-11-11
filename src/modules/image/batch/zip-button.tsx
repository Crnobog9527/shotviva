'use client'

import { useTranslations } from 'next-intl'

import { buttonVariants } from '@/core/ui/button'
import { cn } from '@/core/ui/cn'

import type { Translate } from '@/core/translate'

import { useZipDownload } from './use-zip-download'
import type { ZipState } from './zip-download'

type Props = { batchId: string; count: number; className?: string }

// Download ZIP for one batch (T107, Pro and Max): a quiet ghost button, never the screen's
// primary. The line under it says what is happening: packing (the route builds the archive,
// up to a few minutes for 30 photos), started, or wait a minute after three tries.
export function ZipButton({ batchId, count, className }: Props) {
  const t = useTranslations('app.batchZip')
  const errors = useTranslations('app.errors')
  const { state, start } = useZipDownload(batchId)
  const packing = state.kind === 'packing'
  const line = state.kind === 'packing' ? t('packing', { count }) : zipLine(state, t, errors)
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

// The line under the button: what is happening, or why it did not work.
function zipLine(state: ZipState, t: Translate, errors: Translate): string | null {
  if (state.kind === 'packing') return null
  if (state.kind === 'started') return t('started')
  if (state.kind === 'limited') return t('limited')
  if (state.kind !== 'error') return null
  if (state.code === 'NOT_FOUND') return t('notFound')
  return errors.has(state.code) ? errors(state.code) : errors('fallback')
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
