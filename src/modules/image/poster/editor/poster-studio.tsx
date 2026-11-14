'use client'

import { useTranslations } from 'next-intl'

import type { Balance } from '@/core/billing/pools'
import { Button } from '@/core/ui/button'

import { ConfirmAction } from '../../workspace/example-tools'
import { isSampleText, sampleContactsLeft, typedPoster } from '../content-edit'
import type { PosterStudioState, StudioTemplate } from '../use-poster-studio'
import type { PhotoSort } from '../use-photo-sort'
import type { PosterWeekly } from '../use-poster-weekly'
import { BlockTabs } from './block-tabs'
import { GenerateButton, GeneratePanel } from './generate-panel'
import { pagePhotos } from './page-slots'
import { PasteStep, SortButton } from './paste-step'
import { PhotoPick } from './photo-pick'
import { WeeklyTools } from './weekly-tools'

type Props = { studio: PosterStudioState; template: StudioTemplate; balance: Balance }
// 每周复用 (§5.3): 用上一期 and the store details, and 拍照识别 on the paste step.
export type StudioReuse = { weekly: PosterWeekly; names: Record<string, string>; photo: PhotoSort }
type FormProps = Props & { reuse: StudioReuse }

// The dense-text poster editor's scrolling body (ARCHITECTURE §5.3, DESIGN mobile 375 first):
// paste → check the sorted blocks → sizes. Its primary sits in the dialog's bar (StudioBar).
export function StudioForm({ studio, template, balance, reuse }: FormProps) {
  const t = useTranslations('app.poster')
  const tools = <WeeklyTools studio={studio} weekly={reuse.weekly} names={reuse.names} />
  if (studio.draft.step === 'paste') return <section className="grid gap-6 pt-2">{tools}<PasteStep studio={studio} photo={<PhotoPick photo={reuse.photo} />} /></section>
  return (
    <section className="grid gap-6 pt-2">
      <StudioNotes studio={studio} />
      {tools}
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
      <p className="text-muted-foreground">{t(sampleHint(studio.draft))}</p>
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
          <summary className="min-h-11 cursor-pointer content-center font-medium">{t(studio.draft.origin?.source === 'photo' ? 'photoText' : 'sourceText')}</summary>
          <p className="whitespace-pre-wrap text-muted-foreground">{studio.draft.source}</p>
        </details>
      ) : null}
    </div>
  )
}

// What the content started from: the sample, a sorted paste, a photo, or the last issue.
function sampleHint(draft: PosterStudioState['draft']): 'hint' | 'sortedHint' | 'photoHint' | 'reusedHint' {
  if (draft.fromSample) return 'hint'
  if (draft.origin?.source === 'photo') return 'photoHint'
  return draft.origin?.source === 'reuse' ? 'reusedHint' : 'sortedHint'
}
