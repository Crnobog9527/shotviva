'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { Link } from '@/core/i18n/navigation'
import { buttonVariants } from '@/core/ui/button'
import { cn } from '@/core/ui/cn'

import { startJob } from '../../generation/job-store'
import type { PosterWork } from '../poster-work'

// A poster's text check (ARCHITECTURE §5.3 自动核对), where other works show Make again: all
// lines found, or the lines that differ (what was confirmed, and the closest text on the poster),
// Redraw (one more ordinary job for the same poster of the same set) and a way back to the text.
export function PosterCheckNote({ poster, templateName, onRedraw }: { poster: PosterWork; templateName: string; onRedraw(): void }) {
  const t = useTranslations('app.poster.check')
  const [dismissed, setDismissed] = useState(false)
  const redraw = () => {
    const { redo } = poster
    startJob({
      templateId: redo.templateId, templateName, resolution: redo.resolution, aspect: redo.aspect, credits: redo.credits, inputKey: null, batchId: undefined,
      body: { template_id: redo.templateId, input_key: null, expected_credits: redo.credits, inputs: { copy: {}, aspect_ratio: redo.aspect, resolution: redo.resolution }, poster: { set_id: redo.setId, part: redo.part, redraw_of: redo.jobId } },
    }, 1)
    onRedraw()
  }
  const showDiffs = poster.status === 'mismatch' && !dismissed
  return (
    <section className="grid gap-3 rounded-control bg-wash-faint p-3 text-caption">
      <p className={cn('font-medium', showDiffs && 'text-primary')}>{t(showDiffs ? 'mismatch' : poster.status, { count: poster.diffs.length })}</p>
      {poster.freeRedraw ? <p className="text-muted-foreground">{t('freeNote', { credits: poster.redo.credits })}</p> : null}
      {showDiffs ? (
        <ul className="grid gap-2">
          {poster.diffs.slice(0, 8).map((diff) => (
            <li key={diff.path} className="grid gap-0.5">
              <span>{t('expected')}{diff.expected}</span>
              <span className="text-muted-foreground">{diff.seen ? `${t('seen')}${diff.seen}` : t('notFound')}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={redraw} className={buttonVariants({ variant: 'glass', size: 'touch' })}>
          {poster.freeRedraw ? t('redrawFree') : t('redraw', { credits: poster.redo.credits })}
        </button>
        {showDiffs ? <button type="button" onClick={() => setDismissed(true)} className={buttonVariants({ variant: 'ghost', size: 'touch' })}>{t('dismiss')}</button> : null}
        <Link href={`/generate?poster=${encodeURIComponent(poster.redo.templateId)}`} className={buttonVariants({ variant: 'ghost', size: 'touch' })}>{t('editText')}</Link>
      </div>
    </section>
  )
}
