'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { limitsFor } from '@/core/billing/tier-limits'
import { useRouter } from '@/core/i18n'
import { navTypesFor } from '@/core/ui/nav-motion'

import { isSlotTemplate, type CatalogueTemplate } from '../catalogue/catalogue-template'
import type { CatalogueSeries } from '../catalogue/catalogue-view'
import { isCompareSample, TemplateSample } from '../catalogue/template-sample'
import { FavoriteButton } from '../favorites/favorite-button'
import { BatchLink, type CreateContext } from './create-dialog'
import { CreateSheet } from './create-sheet'
import { FormAction } from './form-action'
import { MemberPicker } from './member-picker'
import { memberSwitch } from './member-switch'
import { useSubmitOnce } from './use-submit-once'
import { useWarmRoute } from './use-warm-route'
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
    const step = memberSwitch(series.members, template.id, id, draft.values.copy)
    if (!step) return
    setMemberId(step.memberId)
    draft.change(step.values)
    if (step.clearPhotos) draft.photos.clear()
  }
  const batch = limitsFor(context.tier).batchMax > 1 && template.photoInput !== 'none' && !isSlotTemplate(template) && draft.photos.photos.length === 0
  const tall = isCompareSample(template)
  const workspace = `/generate/${template.id}`
  // Generate moves to the chosen member's workspace page, kept prefetched while the dialog is open.
  useWarmRoute(workspace, open)
  const submitOnce = useSubmitOnce(open)
  const generate = () => {
    // The dialog stays on screen while it closes: a second press must not queue a second photo.
    if (!submitOnce()) return
    void draft.start()
    onClose()
    router.push(workspace, { transitionTypes: navTypesFor(workspace) })
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
          slots={draft.slots}
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
