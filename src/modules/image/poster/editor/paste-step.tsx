'use client'

import { Check } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

import { POSTER_BLOCKS } from '@/core/poster'

import { Button } from '@/core/ui/button'

import { fieldClass, reveal } from '../../workspace/copy-field-input'
import type { PosterStudioState } from '../use-poster-studio'

const TEXT_MAX = 6000

// Step 1: paste the whole notice; it is sorted into the blocks (ARCHITECTURE §5.3), at once when
// it is laid out the usual way, otherwise by the model with progress shown.
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
      {busy ? <SortProgress stage={studio.stage} /> : null}
      {studio.notice === 'rateLimited' ? <p role="alert" className="text-caption text-destructive">{t('notice.rateLimited')}</p> : null}
      <Button variant="ghost" className="min-h-11" disabled={busy} onClick={studio.toManual}>{t('paste.manual')}</Button>
    </section>
  )
}

// While the model sorts a notice the parser could not: which block it is writing, and the
// seconds so far, so the wait reads as progress rather than a frozen button.
function SortProgress({ stage }: { stage: PosterStudioState['stage'] }) {
  const t = useTranslations('app.poster')
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => setSeconds((value) => value + 1), 1000)
    return () => clearInterval(timer)
  }, [])
  const current = stage ? POSTER_BLOCKS.indexOf(stage) : -1
  return (
    <div role="status" aria-live="polite" className="grid gap-2 rounded-lg border border-border p-3">
      <p className="flex justify-between text-caption">
        <span>{stage ? t('paste.progress.writing', { block: t(`tabs.${stage}`) }) : t('paste.progress.reading')}</span>
        <span className="tabular-nums text-muted-foreground">{t('paste.progress.seconds', { seconds })}</span>
      </p>
      <div className="h-1 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-[width] duration-700 ease-out" style={{ width: `${Math.round(((current + 1) / (POSTER_BLOCKS.length + 1)) * 100)}%` }} />
      </div>
      <ol className="flex flex-wrap gap-x-3 gap-y-1 text-caption text-muted-foreground">
        {POSTER_BLOCKS.map((block, index) => (
          <li key={block} className={`flex items-center gap-1 ${index === current ? 'font-medium text-foreground' : ''}`}>
            {index < current ? <Check aria-hidden className="size-3.5 text-primary" /> : null}
            {t(`tabs.${block}`)}
          </li>
        ))}
      </ol>
    </div>
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
