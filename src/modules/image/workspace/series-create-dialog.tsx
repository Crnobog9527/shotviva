'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { limitsFor } from '@/core/billing/tier-limits'
import { useRouter } from '@/core/i18n'
import { navTypesFor } from '@/core/ui/nav-motion'

import type { CatalogueTemplate } from '../catalogue/catalogue-template'
import type { CatalogueSeries } from '../catalogue/catalogue-view'
import { isCompareSample, TemplateSample } from '../catalogue/template-sample'
import { FavoriteButton } from '../favorites/favorite-button'
import { BatchLink, type CreateContext } from './create-dialog'
import { CreateSheet } from './create-sheet'
import { FormAction } from './form-action'
import { MemberPicker } from './member-picker'
import { useWorkspaceDraft } from './use-workspace-draft'
import { WorkspaceForm } from './workspace-form'

type Props = CreateContext & { series: CatalogueSeries | null; onClose(): void }

// Opening a series goes straight to making a photo (Owner 2026-11-12, after Lovart's series
// panel): the creation dialog's frame with the series' members to switch between beside the
// chosen one's sample, and that template's form on the right. One step, no picker sheet first.
export function SeriesCreateDialog({ series, onClose, ...context }: Props) {
  // The last series stays mounted while the dialog closes, so its closing motion can play.
  const [shown, setShown] = useState(series)
  if (series && series !== shown) setShown(series)
  if (!shown || shown.members.length === 0) return null
  return <SeriesBody key={shown.id} series={shown} open={series !== null} onClose={onClose} {...context} />
}

type BodyProps = CreateContext & { series: CatalogueSeries; open: boolean; onClose(): void }

function SeriesBody({ series, open, onClose, ...context }: BodyProps) {
  const t = useTranslations('app')
  const router = useRouter()
  const [memberId, setMemberId] = useState(series.members[0]!.id)
  const template = series.members.find((member) => member.id === memberId) ?? series.members[0]!
  // One draft for the whole series: a switch keeps the photo, size and resolution and drops
  // what belonged to the template before (its text fields and on/off choices).
  const draft = useWorkspaceDraft({ template, ...context, single: true })
  const choose = (id: string) => {
    const next = series.members.find((member) => member.id === id)
    if (!next || next.id === template.id) return
    setMemberId(next.id)
    draft.change({ copy: {}, toggles: {} })
    if (next.photoInput === 'none') draft.photos.clear()
  }
  const batch = limitsFor(context.tier).batchMax > 1 && draft.photos.photos.length === 0
  const tall = isCompareSample(template)
  const generate = () => {
    void draft.start()
    onClose()
    router.push(`/generate/${template.id}`, { transitionTypes: navTypesFor(`/generate/${template.id}`) })
  }
  return (
    <CreateSheet
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title={template.name}
      description={[template.categoryName, template.description].filter(Boolean).join(' · ')}
      hint={t(tall ? 'template.hintCompare' : 'template.hintPair')}
      tall={tall}
      folded={draft.photos.photos.length > 0}
      picker={<MemberPicker label={t('series.members', { name: series.name, count: series.members.length })} members={series.members} value={template.id} onChange={choose} />}
      sample={<Sample template={template} tall={tall} />}
      form={
        <WorkspaceForm
          key={template.id}
          template={template}
          balance={context.balance}
          tier={context.tier}
          photos={draft.photos}
          values={draft.values}
          onChange={draft.change}
          surface="create_dialog"
          photoExtra={batch ? <BatchLink templateId={template.id} onGo={onClose} /> : null}
        />
      }
      bar={<FormAction state={draft.state} resolution={draft.values.resolution} batch={draft.photos.batchMax > 1} onGenerate={generate} placement="sheet" limit={context.concurrency.limit} />}
    />
  )
}

function Sample({ template, tall }: { template: CatalogueTemplate; tall: boolean }) {
  return (
    <div key={template.id} className="sample-swap relative max-md:h-full">
      <TemplateSample template={template} className="max-md:h-full max-md:aspect-auto" />
      {/* The save heart (T83) takes the right corner the Phone / AI tags leave free. */}
      <FavoriteButton template={template} surface="create_dialog" className={tall ? 'right-1 bottom-1' : 'top-1 right-1'} />
    </div>
  )
}
