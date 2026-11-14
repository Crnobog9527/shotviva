'use client'

import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

import { Button } from '@/core/ui/button'

import { fieldClass, reveal } from '../../workspace/copy-field-input'
import type { PosterStudioState } from '../use-poster-studio'
import { SortProgress } from './sort-progress'

const TEXT_MAX = 6000

// Step 1: paste the whole notice; it is sorted into the blocks (ARCHITECTURE §5.3), at once when
// it is laid out the usual way, otherwise by the model with progress shown.
// `photo`: 拍照识别, offered beside the paste box (§5.3「每周复用」).
export function PasteStep({ studio, photo }: { studio: PosterStudioState; photo?: ReactNode }) {
  const t = useTranslations('app.poster')
  const { draft, busy } = studio
  return (
    <section className="grid gap-3">
      <h2 className="text-title font-semibold">{t('paste.heading')}</h2>
      <p className="text-caption text-muted-foreground">{t('paste.hint')}</p>
      {photo}
      <textarea value={draft.source} rows={12} maxLength={TEXT_MAX} onFocus={reveal} aria-label={t('paste.heading')}
        placeholder={t('paste.placeholder')} onChange={(event) => studio.setSource(event.target.value)} className={`${fieldClass} min-h-[260px]`} />
      <p className="text-right text-caption text-muted-foreground">{draft.source.length} / {TEXT_MAX}</p>
      {busy ? <SortProgress stage={studio.stage} /> : null}
      {studio.notice === 'rateLimited' ? <p role="alert" className="text-caption text-destructive">{t('notice.rateLimited')}</p> : null}
      <Button variant="ghost" className="min-h-11" disabled={busy} onClick={studio.toManual}>{t(draft.fromSample ? 'paste.manualSample' : 'paste.manual')}</Button>
    </section>
  )
}

// The paste step's primary, in the dialog's pinned bar: the model sorts the text into blocks.
export function SortButton({ studio }: { studio: PosterStudioState }) {
  const t = useTranslations('app.poster')
  return (
    <Button className="min-h-12 w-full" disabled={studio.busy || !studio.draft.source.trim()} onClick={() => void studio.sort()}>
      {studio.busy ? t('paste.sorting') : t('paste.sort')}
    </Button>
  )
}
