'use client'


import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { batchMaxFor } from '@/core/billing/tier-limits'
import { useRouter } from '@/core/i18n'
import { navTypesFor } from '@/core/ui/nav-motion'

import { CatalogueFormStatus } from '../catalogue/catalogue-form-status'
import { isSlotTemplate, type CatalogueTemplate } from '../catalogue/catalogue-template'
import type { CatalogueSeries } from '../catalogue/catalogue-view'
import { isCompareSample } from '../catalogue/template-sample'
import { useCatalogueForms } from '../catalogue/use-catalogue-forms'
import { ZoomableSample } from '../catalogue/zoomable-sample'
import { ShareButton } from '../share/share-button'
import { FavoriteButton } from '../favorites/favorite-button'
import { matchesStore } from '@/core/store-profile'

import { FormWeeklyTools } from '../again/form-weekly-tools'
import { useFormWeekly } from '../again/use-form-weekly'
import { BatchLink, type CreateContext } from './create-dialog'
import { CreateSheet } from './create-sheet'
import { FormAction } from './form-action'
import { MemberPicker } from './member-picker'
import { PendingCatalogueForm } from './pending-catalogue-form'
import { memberSwitch } from './member-switch'
import { useSubmitOnce } from './use-submit-once'
import { useWarmRoute } from './use-warm-route'
import { useWorkspaceDraft } from './use-workspace-draft'
import { WorkspaceForm } from './workspace-form'
import { PoolChoiceMount } from './pool-choice-mount'


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

function SeriesBody(props: BodyProps) {
  const { series, open, onClose } = props
  // One read when the sheet opens keeps switching between the members instant.
  const forms = useCatalogueForms(series.members)
  const members = series.members.map(forms.fill)
  if (members.some((member) => member.formDeferred && (member.hasDeferredSlots || member.hasDeferredGroups))) {
    return <PendingCatalogueForm template={members[0]!} open={open} onClose={onClose} failed={forms.failed} retry={forms.retry} />
  }
  return <SeriesForm {...props} forms={forms} series={{ ...series, members }} />
}

function SeriesForm({ series, open, onClose, forms, ...context }: BodyProps & { forms: ReturnType<typeof useCatalogueForms> }) {
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
  // 用上一期 reads any style of the series (§5.3「每周复用」).
  const weekly = useFormWeekly(template, draft, series.members.map((member) => member.id))
  const batch = batchMaxFor(context.tier, context.batch) > 1 && template.photoInput !== 'none' && !isSlotTemplate(template) && draft.photos.photos.length === 0
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
      share={<ShareButton template={template} />}
      folded={draft.photos.photos.length > 0}
      picker={<MemberPicker label={t('series.members', { name: series.name, count: series.members.length })} members={series.members} value={template.id} onChange={choose} />}
      sample={<Sample template={template} tall={tall} />}
      form={<>
        {template.formDeferred ? null : <FormWeeklyTools weekly={weekly} names={Object.fromEntries(series.members.map((member) => [member.id, member.name]))} storeFields={matchesStore(template.copyFields)} />}
        <WorkspaceForm
          key={template.id}
          template={template}
          balance={draft.choice.balance}
          tier={context.tier}
          photos={draft.photos}
          slots={draft.slots}
          values={draft.values}
          onChange={draft.change}
          surface="create_dialog"
          examples={draft.fromExamples}
          detailsStatus={template.formDeferred && <CatalogueFormStatus failed={forms.failed} retry={forms.retry} />}
          photoExtra={batch ? <BatchLink templateId={template.id} onGo={onClose} /> : null}
        />
        <PoolChoiceMount choice={draft.choice.picker} />
      </>}
      bar={<FormAction state={draft.state} resolution={draft.values.resolution} batch={draft.photos.batchMax > 1} onGenerate={generate} placement="sheet" limit={context.concurrency.limit} privateOnly={template.privateOnly} examplesLeft={draft.examplesLeft} orgOnly={draft.choice.orgOnly} />}
    />
  )
}

function Sample({ template, tall }: { template: CatalogueTemplate; tall: boolean }) {
  return (
    <div key={template.id} className="sample-swap relative max-md:h-full">
      <ZoomableSample template={template} className="max-md:h-full max-md:aspect-auto" />
      {/* The save heart (T83) takes the right corner the Phone / AI tags leave free. */}
      <FavoriteButton template={template} surface="create_dialog" className={tall ? 'right-1 bottom-1' : 'top-1 right-1'} />
    </div>
  )
}
