'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useState, type ReactNode } from 'react'

import type { TemplatePreviewProps } from '@/core/admin'
import type { Locale } from '@/core/i18n/locales'
import { localizeTemplate } from '@/core/templates/localize'
import type { Template } from '@/core/templates/types'
import { cn } from '@/core/ui/cn'

import { toCatalogueTemplate, type CatalogueTemplate } from '../catalogue/catalogue-template'
import { isCompareSample } from '../catalogue/template-sample'
import { ZoomableSample } from '../catalogue/zoomable-sample'
import { FavoriteButton } from '../favorites/favorite-button'
import { PreviewFavorites } from '../favorites/favorites-provider'
import { ShareButton } from '../share/share-button'
import { CloseButton, DESKTOP_FRAME, DesktopPanes, PhonePanes, type PaneProps } from '../workspace/create-sheet'
import { FormAction } from '../workspace/form-action'
import { MemberPicker } from '../workspace/member-picker'
import { memberSwitch } from '../workspace/member-switch'
import { useWorkspaceDraft } from '../workspace/use-workspace-draft'
import { WorkspaceForm } from '../workspace/workspace-form'

// A plausible account for the bar and balance line; the preview never charges or starts anything.
const PREVIEW_ACCOUNT = { balance: { paid: 100, free: 0 }, tier: null, concurrency: { limit: 1, runningIds: [] } }

const toCard = (template: Template, locale: Locale) => toCatalogueTemplate(localizeTemplate(template, locale))

// The admin editor's 实时预览 (Owner 2026-11-13): the creation dialog users get when they open a
// template (create-dialog.tsx / series-create-dialog.tsx), drawn inline from the editor's unsaved
// draft with the same panes, sample, share button, heart, series strip, form and action bar. It
// scrolls and its switches and choices work (Owner 2026-11-14: the inert frame read as a picture);
// the admin frame stops only uploads, links and submits, and the heart is local to the preview.
export function TemplateCreatePreview({ template, series, width }: Omit<TemplatePreviewProps, 'locale'>) {
  const locale = useLocale() as Locale
  const shown = toCard(template, locale)
  const members = series && series.members.length > 1 ? series.members.map(member => (member.id === template.id ? shown : toCard(member, locale))) : null
  // A change to what the form asks for (fields, switches, photo slots) starts the preview's own
  // form over, so its choices always belong to the draft; label and price edits redraw in place.
  const revision = formShape(shown)
  return (
    <PreviewFavorites>
      <PreviewBody key={`${shown.id}:${revision}`} draftId={shown.id} members={members ?? [shown]} seriesName={members && series ? series.name : null} width={width} />
    </PreviewFavorites>
  )
}

// The keys and kinds the creation form is built from, not their wording.
function formShape(card: CatalogueTemplate): string {
  return JSON.stringify([card.photoInput, (card.copyFields ?? []).map(field => [field.key, field.type, field.required]),
    (card.toggles ?? []).map(toggle => toggle.key), (card.imageSlots ?? []).map(slot => [slot.key, slot.required])])
}

type BodyProps = { draftId: string; members: CatalogueTemplate[]; seriesName: string | null; width: TemplatePreviewProps['width'] }

function PreviewBody({ draftId, members, seriesName, width }: BodyProps) {
  const t = useTranslations('app')
  // The series strip switches members as in the user's dialog; it opens on the template being edited.
  const [memberId, setMemberId] = useState(draftId)
  const template = members.find(member => member.id === memberId) ?? members[0]!
  const draft = useWorkspaceDraft({ template, ...PREVIEW_ACCOUNT, single: true })
  const choose = (id: string) => {
    const step = memberSwitch(members, template.id, id, draft.values.copy)
    if (!step) return
    setMemberId(step.memberId)
    draft.change(step.values)
  }
  const tall = isCompareSample(template)
  const panes: Omit<PaneProps, 'Title' | 'Description'> = {
    title: template.name,
    description: [template.categoryName, template.description].filter(Boolean).join(' · '),
    hint: t(tall ? 'template.hintCompare' : 'template.hintPair'),
    tall,
    folded: false,
    share: <span data-preview-block="">{/* Shown as users see it; a press would share the live page. */}<ShareButton template={template} /></span>,
    sample: (
      <div key={template.id} className="sample-swap relative max-md:h-full">
        <ZoomableSample template={template} className="max-md:h-full max-md:aspect-auto" />
        <FavoriteButton template={template} surface="create_dialog" className={tall ? 'right-1 bottom-1' : 'top-1 right-1'} />
      </div>
    ),
    picker: seriesName ? <MemberPicker label={t('series.members', { name: seriesName, count: members.length })} members={members} value={template.id} onChange={choose} /> : null,
    form: <WorkspaceForm key={template.id} template={template} balance={PREVIEW_ACCOUNT.balance} tier={null} photos={draft.photos} slots={draft.slots} values={draft.values} onChange={draft.change} surface="create_dialog" />,
    bar: <FormAction state={draft.state} resolution={draft.values.resolution} batch={false} onGenerate={() => {}} placement="sheet" limit={1} privateOnly={template.privateOnly} />,
  }
  if (width === 'desktop') {
    return <Frame className={cn(DESKTOP_FRAME, 'size-full')}><DesktopPanes {...panes} Title="h2" Description="p" /></Frame>
  }
  return <Frame className="flex size-full flex-col bg-popover pt-4"><PhonePanes {...panes} Title={PhoneTitle} Description={PhoneDescription} /></Frame>
}

function Frame({ className, children }: { className: string; children: ReactNode }) {
  return (
    <div className={cn('relative', className)}>
      {children}
      <CloseButton Close="span" className="top-3 right-3" />
    </div>
  )
}

// The drawer's title and description look (core/ui/drawer.tsx), outside a drawer.
function PhoneTitle({ className, children }: { className?: string; children: ReactNode }) {
  return <h2 className={cn('font-display text-h1 leading-[1.05]', className)}>{children}</h2>
}

function PhoneDescription({ className, children }: { className?: string; children: ReactNode }) {
  return <p className={cn('text-caption text-muted-foreground', className)}>{children}</p>
}
