'use client'

import { useTranslations } from 'next-intl'

import type { Balance } from '@/core/billing/pools'
import { Button } from '@/core/ui/button'

import type { PosterStudioState, StudioTemplate } from '../use-poster-studio'
import { BlockTabs } from './block-tabs'
import { GenerateButton, GeneratePanel } from './generate-panel'
import { PageSlots } from './page-slots'
import { PasteStep, SortButton } from './paste-step'

type Props = { studio: PosterStudioState; template: StudioTemplate; balance: Balance }

// The dense-text poster editor's scrolling body (ARCHITECTURE §5.3, DESIGN mobile 375 first):
// paste → check the sorted blocks → sizes. Its primary sits in the dialog's bar (StudioBar).
export function StudioForm({ studio, template, balance }: Props) {
  const t = useTranslations('app.poster')
  if (studio.draft.step === 'paste') return <section className="pt-2"><PasteStep studio={studio} /></section>
  return (
    <section className="grid gap-6 pt-2">
      {studio.notice === 'sortFailed' || studio.notice === 'clipped'
        ? <p className="rounded-control bg-wash-faint p-3 text-caption">{t(`notice.${studio.notice}`)}</p> : null}
      {studio.draft.source ? (
        <details className="rounded-control bg-wash-faint p-3 text-caption">
          <summary className="min-h-11 cursor-pointer content-center font-medium">{t('sourceText')}</summary>
          <p className="whitespace-pre-wrap text-muted-foreground">{studio.draft.source}</p>
        </details>
      ) : null}
      <BlockTabs poster={template.poster} unverified={studio.draft.unverified} content={studio.draft.content}
        flagged={(path) => studio.draft.unverified.includes(path)} onChange={studio.edit}
        pageExtra={(kind) => <PageSlots template={template} kind={kind} photos={studio.photos} />} />
      <GeneratePanel studio={studio} template={template} balance={balance} />
      <Button variant="ghost" className="min-h-11" onClick={studio.toPaste}>{t('backToPaste')}</Button>
    </section>
  )
}

// The one primary of each step: 整理内容 while pasting, 生成 once the blocks are there.
export function StudioBar({ studio, template, balance }: Props) {
  return studio.draft.step === 'paste' ? <SortButton studio={studio} /> : <GenerateButton studio={studio} template={template} balance={balance} />
}

