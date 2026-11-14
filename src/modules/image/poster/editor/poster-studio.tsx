'use client'

import { useTranslations } from 'next-intl'

import type { Balance } from '@/core/billing/pools'
import { Button } from '@/core/ui/button'

import type { PosterStudioState, StudioTemplate } from '../use-poster-studio'
import { BlockTabs } from './block-tabs'
import { GenerateButton, GeneratePanel } from './generate-panel'
import { pagePhotos } from './page-slots'
import { PasteStep, SortButton } from './paste-step'

type Props = { studio: PosterStudioState; template: StudioTemplate; balance: Balance }

// The dense-text poster editor's scrolling body (ARCHITECTURE §5.3, DESIGN mobile 375 first):
// paste → check the sorted blocks → sizes. Its primary sits in the dialog's bar (StudioBar).
export function StudioForm({ studio, template, balance }: Props) {
  const t = useTranslations('app.poster')
  if (studio.draft.step === 'paste') return <section className="pt-2"><PasteStep studio={studio} /></section>
  return (
    <section className="grid gap-6 pt-2">
      <StudioNotes studio={studio} />
      <BlockTabs poster={template.poster} unverified={studio.draft.unverified} content={studio.draft.content}
        flagged={(path) => studio.draft.unverified.includes(path)} onChange={studio.edit}
        pagePhotos={pagePhotos(template, studio.photos, studio.qrCheck, t('folds.photos'))} />
      <GeneratePanel studio={studio} template={template} balance={balance} />
      <Button variant="ghost" className="min-h-11" onClick={studio.toPaste}>{t('backToPaste')}</Button>
    </section>
  )
}

// The one primary of each step: 整理内容 while pasting, 生成 once the blocks are there.
export function StudioBar({ studio, template, balance }: Props) {
  return studio.draft.step === 'paste' ? <SortButton studio={studio} /> : <GenerateButton studio={studio} template={template} balance={balance} />
}

// The notice and the pasted text sit at the top of the form, under the dialog's close button:
// as the section's first div they take the frame's right inset (create-sheet.tsx), so their
// boxes stop short of the button instead of running under it.
function StudioNotes({ studio }: { studio: PosterStudioState }) {
  const t = useTranslations('app.poster')
  const notice = studio.notice === 'sortFailed' || studio.notice === 'clipped' ? studio.notice : null
  if (!notice && !studio.draft.source) return null
  return (
    <div className="grid gap-6">
      {notice ? <p className="rounded-control bg-wash-faint p-3 text-caption">{t(`notice.${notice}`)}</p> : null}
      {studio.draft.source ? (
        <details className="rounded-control bg-wash-faint p-3 text-caption">
          <summary className="min-h-11 cursor-pointer content-center font-medium">{t('sourceText')}</summary>
          <p className="whitespace-pre-wrap text-muted-foreground">{studio.draft.source}</p>
        </details>
      ) : null}
    </div>
  )
}
