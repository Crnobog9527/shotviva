'use client'

import { useLocale, useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

import type { TemplatePreviewProps } from '@/core/admin'
import type { Locale } from '@/core/i18n/locales'
import { localizeTemplate } from '@/core/templates/localize'
import type { Template } from '@/core/templates/types'
import { cn } from '@/core/ui/cn'

import { toCatalogueTemplate, type CatalogueTemplate } from '../catalogue/catalogue-template'
import { isCompareSample, TemplateSample } from '../catalogue/template-sample'
import { CloseButton, DESKTOP_FRAME, DesktopPanes, PhonePanes, type PaneProps } from '../workspace/create-sheet'
import { FormAction } from '../workspace/form-action'
import { MemberPicker } from '../workspace/member-picker'
import { useWorkspaceDraft } from '../workspace/use-workspace-draft'
import { WorkspaceForm } from '../workspace/workspace-form'

// A plausible account for the bar and balance line; the preview never charges or starts anything.
const PREVIEW_ACCOUNT = { balance: { paid: 100, free: 0 }, tier: null, concurrency: { limit: 1, runningIds: [] } }

const toCard = (template: Template, locale: Locale) => toCatalogueTemplate(localizeTemplate(template, locale))

// The admin editor's 实时预览 (Owner 2026-11-13): the creation dialog users get when they open a
// template (create-dialog.tsx / series-create-dialog.tsx), drawn inline from the editor's unsaved
// draft with the same panes, sample, series strip, form and action bar. The admin frame makes it
// inert, so nothing in it uploads or generates.
export function TemplateCreatePreview({ template, series, width }: Omit<TemplatePreviewProps, 'locale'>) {
  const locale = useLocale() as Locale
  const shown = toCard(template, locale)
  const members = series && series.members.length > 1 ? series.members.map(member => (member.id === template.id ? shown : toCard(member, locale))) : null
  return <PreviewBody key={shown.id} template={shown} series={members && series ? { name: series.name, members } : null} width={width} />
}

type BodyProps = { template: CatalogueTemplate; series: { name: string; members: CatalogueTemplate[] } | null; width: TemplatePreviewProps['width'] }

function PreviewBody({ template, series, width }: BodyProps) {
  const t = useTranslations('app')
  const draft = useWorkspaceDraft({ template, ...PREVIEW_ACCOUNT, single: true })
  const tall = isCompareSample(template)
  const panes: Omit<PaneProps, 'Title' | 'Description'> = {
    title: template.name,
    description: [template.categoryName, template.description].filter(Boolean).join(' · '),
    hint: t(tall ? 'template.hintCompare' : 'template.hintPair'),
    tall,
    folded: false,
    sample: <div className="relative max-md:h-full"><TemplateSample template={template} className="max-md:h-full max-md:aspect-auto" /></div>,
    picker: series ? <MemberPicker label={t('series.members', { name: series.name, count: series.members.length })} members={series.members} value={template.id} onChange={() => {}} /> : null,
    form: <WorkspaceForm template={template} balance={PREVIEW_ACCOUNT.balance} tier={null} photos={draft.photos} slots={draft.slots} values={draft.values} onChange={draft.change} surface="create_dialog" />,
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
