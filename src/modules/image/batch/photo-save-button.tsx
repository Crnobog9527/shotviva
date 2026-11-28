'use client'

import { useEffect } from 'react'
import { useTranslations } from 'next-intl'

import { buttonVariants } from '@/core/ui/button'
import { cn } from '@/core/ui/cn'

import type { Translate } from '@/core/translate'

import { usePhotoSave, type PhotoLinkSource, type PhotoSaveState } from './use-photo-save'

type Props = { links: PhotoLinkSource; count: number; className?: string; onUnsupported(): void }

// Save-to-phone for one batch, or for the works picked on Photos: same quiet ghost button as the ZIP. The line under it says what
// the next tap does or how far along the groups are.
export function PhotoSaveButton({ links, count, className, onUnsupported }: Props) {
  const t = useTranslations('app.batchSave')
  const errors = useTranslations('app.errors')
  const zip = useTranslations('app.batchZip')
  const { state, press } = usePhotoSave(links)
  useEffect(() => {
    if (state.kind === 'unsupported') onUnsupported()
  }, [state.kind, onUnsupported])
  const busy = state.kind === 'preparing' || state.kind === 'saving'
  const line = saveLine(state, t, zip, errors)
  return (
    <div className={cn('flex flex-col', className)}>
      <button
        type="button"
        onClick={press}
        aria-busy={busy}
        disabled={busy || state.kind === 'limited' || state.kind === 'done'}
        className={buttonVariants({ variant: 'glass', size: 'touch', className: 'gap-2 disabled:opacity-100' })}
      >
        {busy ? <Spinner /> : <SaveIcon />}
        <span>{label(state, count, t)}</span>
      </button>
      <p aria-live="polite" className={cn('text-caption leading-[1.4] text-muted-foreground', line ? 'mt-1.5' : 'sr-only')}>
        {line}
      </p>
    </div>
  )
}

function label(state: PhotoSaveState, count: number, t: Translate) {
  if (state.kind === 'preparing') return t('preparingCta')
  if (state.kind === 'saving') return t('savingCta')
  if (state.kind === 'done') return t('doneCta')
  if (state.kind === 'ready') return state.saved ? t('ctaNext', { count: state.count }) : t('cta', { count: state.count })
  return t('cta', { count })
}

function saveLine(state: PhotoSaveState, t: Translate, zip: Translate, errors: Translate): string | null {
  if (state.kind === 'ready') return state.saved ? t('progress', { saved: state.saved, total: state.total }) : t('hint')
  if (state.kind === 'done') return t('done', { total: state.total })
  if (state.kind === 'limited') return zip('limited')
  if (state.kind !== 'error') return null
  if (state.code === 'NOT_FOUND') return zip('notFound')
  return errors.has(state.code) ? errors(state.code) : errors('fallback')
}

function SaveIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4 flex-none" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="5" width="16" height="14" rx="2.5" />
      <path d="m4 15 4.5-4.5 4 4L16 11l4 4M9 9.2h.01" />
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
