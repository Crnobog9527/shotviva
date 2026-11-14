'use client'

import { useTranslations } from 'next-intl'

import type { Balance } from '@/core/billing/pools'
import { Button } from '@/core/ui/button'

import { ConfirmAction } from '../../workspace/example-tools'
import { isSampleText, sampleContactsLeft, typedPoster } from '../content-edit'
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
      {template.poster.sample ? <SampleTools studio={studio} sample={template.poster.sample} /> : null}
      <BlockTabs poster={template.poster} unverified={studio.draft.unverified} content={studio.draft.content}
        flagged={(path) => studio.draft.unverified.includes(path)} onChange={studio.edit} onClear={studio.clearPart}
        sample={(path) => studio.draft.fromSample && isSampleText(studio.draft.content, template.poster.sample, path)}
        pagePhotos={pagePhotos(template, studio.photos, t('folds.photos'), studio.qrCheck)} />
      <GeneratePanel studio={studio} template={template} balance={balance} />
      <Button variant="ghost" className="min-h-11" onClick={studio.toPaste}>{t('backToPaste')}</Button>
    </section>
  )
}

// The one primary of each step: 整理内容 while pasting, 生成 once the blocks are there.
// Above 生成, one line when the sample's organiser, phone or address is still there; it never blocks.
export function StudioBar({ studio, template, balance }: Props) {
  const t = useTranslations('app.poster')
  if (studio.draft.step === 'paste') return <SortButton studio={studio} />
  const left = sampleContactsLeft(studio.draft.content, template.poster.sample)
  return (
    <div className="grid w-full gap-2">
      {left ? <p role="status" className="text-caption text-primary">{t('sample.contactsLeft')}</p> : null}
      <GenerateButton studio={studio} template={template} balance={balance} />
    </div>
  )
}

// The editor starts from the cover poster's text (fields.poster.sample): a line saying so, with
// 全部清空 (every word gone, the rows and sections kept) and 恢复示例.
function SampleTools({ studio, sample }: { studio: PosterStudioState; sample: StudioTemplate['poster']['sample'] }) {
  const t = useTranslations('app.poster.sample')
  // Words the user typed (or a sorted notice) are asked about before they are wiped.
  const typed = typedPoster(studio.draft.content, studio.draft.fromSample ? sample : undefined)
  return (
    <div className="grid gap-2 rounded-control bg-wash-faint p-3 text-caption">
      <p className="text-muted-foreground">{t(studio.draft.fromSample ? 'hint' : 'sortedHint')}</p>
      <div className="flex flex-wrap gap-2">
        <ConfirmAction variant="outline" label={t('clearAll')} question={t('clearAllQuestion')} risky={typed} onConfirm={studio.clearAll} />
        <ConfirmAction label={t('restore')} question={t('restoreQuestion')} risky={typed} onConfirm={studio.restoreSample} />
      </div>
    </div>
  )
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
