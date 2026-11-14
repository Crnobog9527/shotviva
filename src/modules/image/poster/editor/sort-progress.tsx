'use client'

import { Check } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

import { POSTER_BLOCKS, type PosterBlock } from '@/core/poster'

// While the model sorts a notice the parser could not: which block it is writing, and the
// seconds so far, so the wait reads as progress rather than a frozen button.
export function SortProgress({ stage, reading }: { stage: PosterBlock | null; reading?: string }) {
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
        <span>{stage ? t('paste.progress.writing', { block: t(`tabs.${stage}`) }) : reading ?? t('paste.progress.reading')}</span>
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

