'use client'

import { useTranslations } from 'next-intl'

import { Button } from '@/core/ui/button'

import { fieldClass, reveal } from '../../workspace/copy-field-input'
import type { PosterStudioState } from '../use-poster-studio'

const TEXT_MAX = 6000

// Step 1: paste the whole notice; the model sorts it into the blocks (ARCHITECTURE §5.3).
export function PasteStep({ studio }: { studio: PosterStudioState }) {
  const t = useTranslations('app.poster')
  const { draft, busy } = studio
  return (
    <section className="grid gap-3">
      <h2 className="text-title font-semibold">{t('paste.heading')}</h2>
      <p className="text-caption text-muted-foreground">{t('paste.hint')}</p>
      <textarea value={draft.source} rows={12} maxLength={TEXT_MAX} onFocus={reveal} aria-label={t('paste.heading')}
        placeholder={t('paste.placeholder')} onChange={(event) => studio.setSource(event.target.value)} className={`${fieldClass} min-h-[260px]`} />
      <p className="text-right text-caption text-muted-foreground">{draft.source.length} / {TEXT_MAX}</p>
      {studio.notice === 'rateLimited' ? <p className="text-caption text-destructive">{t('notice.rateLimited')}</p> : null}
      <Button variant="ghost" className="min-h-11" disabled={busy} onClick={studio.toManual}>{t('paste.manual')}</Button>
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
