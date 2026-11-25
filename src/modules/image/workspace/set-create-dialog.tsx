'use client'

import { useTranslations } from 'next-intl'
import { useState, type ReactNode } from 'react'

import { useRouter } from '@/core/i18n'
import { navTypesFor } from '@/core/ui/nav-motion'

import { CatalogueFormStatus } from '../catalogue/catalogue-form-status'
import type { CatalogueTemplate } from '../catalogue/catalogue-template'
import { isCompareSample } from '../catalogue/template-sample'
import { useCatalogueForms } from '../catalogue/use-catalogue-forms'
import { ZoomableSample } from '../catalogue/zoomable-sample'
import { ShareButton } from '../share/share-button'
import { FavoriteButton } from '../favorites/favorite-button'
import { CreateSheet } from './create-sheet'
import { FormAction } from './form-action'
import { MemberPicker } from './member-picker'
import { PendingCatalogueForm } from './pending-catalogue-form'
import { memberSwitch } from './member-switch'
import { useSubmitOnce } from './use-submit-once'
import { useWarmRoute } from './use-warm-route'
import { useWorkspaceDraft, type CreateContext, type WorkspaceDraft } from './use-workspace-draft'
import { WorkspaceForm } from './workspace-form'
import type { TemplateSet } from './template-set'

export type { TemplateSet } from './template-set'

// What the frame adds around the shared form: Create's 用上一期 tools and Batch link (they read the
// account's own works), or, signed out on the public pages, the sign-up primary in place of
// Generate (no photo uploads, nothing is charged).
export type SetFrame = {
  tools?(args: { template: CatalogueTemplate; draft: WorkspaceDraft; set: TemplateSet }): ReactNode
  photoExtra?(args: { template: CatalogueTemplate; draft: WorkspaceDraft; onClose(): void }): ReactNode
  guest?: { bar(template: CatalogueTemplate): ReactNode } | null
}

type Props = CreateContext & {
  set: TemplateSet | null
  // The member the panel opens on; absent or unknown: the first.
  startId?: string | null
  onClose(): void
  frame?: SetFrame
  initialFile?: File | null
  // Where focus goes back on close (create-sheet.tsx).
  returnFocus?(): HTMLElement | null
}

// One template, a series or a bundle in the creation dialog's frame (Owner 2026-11-12, after
// Lovart's series panel; public pages 2026-11-25): the chosen member's sample, name and
// description, the set's members to switch between under it, that template's form on the right
// and its primary pinned at the bottom. One step, no picker sheet first.
export function SetCreateDialog({ set, onClose, ...rest }: Props) {
  // The last set stays mounted while the dialog closes, so its closing motion can play.
  const [shown, setShown] = useState(set)
  if (set && set !== shown) setShown(set)
  if (!shown || shown.members.length === 0) return null
  return <SetBody key={shown.id} set={shown} open={set !== null} onClose={onClose} {...rest} />
}

type BodyProps = Omit<Props, 'set'> & { set: TemplateSet; open: boolean }

function SetBody(props: BodyProps) {
  const { set, open, onClose } = props
  // One read when the sheet opens keeps switching between the members instant.
  const forms = useCatalogueForms(set.members)
  const members = set.members.map(forms.fill)
  if (members.some((member) => member.formDeferred && (member.hasDeferredSlots || member.hasDeferredGroups))) {
    return <PendingCatalogueForm template={members[0]!} open={open} onClose={onClose} failed={forms.failed} retry={forms.retry} />
  }
  return <SetForm {...props} forms={forms} set={{ ...set, members }} />
}

function useMember(set: TemplateSet, startId: string | null | undefined) {
  const [memberId, setMemberId] = useState(() => set.members.find((member) => member.id === startId)?.id ?? set.members[0]!.id)
  return { template: set.members.find((member) => member.id === memberId) ?? set.members[0]!, setMemberId }
}

function SetForm({ set, open, onClose, forms, startId, frame, initialFile, returnFocus, ...context }: BodyProps & { forms: ReturnType<typeof useCatalogueForms> }) {
  const t = useTranslations('app')
  const { template, setMemberId } = useMember(set, startId)
  const guest = frame?.guest ?? null
  // One draft for the whole set: a switch keeps the photo, size and resolution and drops what
  // belonged to the template before (its text fields and on/off choices).
  const draft = useWorkspaceDraft({ template, ...context, single: true, local: guest !== null, initialFile })
  const choose = (id: string) => {
    const step = memberSwitch(set.members, template.id, id, draft.values.copy)
    if (!step) return
    setMemberId(step.memberId)
    draft.change(step.values)
    if (step.clearPhotos) draft.photos.clear()
  }
  const tall = isCompareSample(template)
  const generate = useGenerate(template.id, open && guest === null, draft, onClose)
  return (
    <CreateSheet
      open={open}
      onOpenChange={(next) => !next && onClose()}
      returnFocus={returnFocus}
      title={template.name}
      description={[template.categoryName, template.description].filter(Boolean).join(' · ')}
      hint={t(tall ? 'template.hintCompare' : 'template.hintPair')}
      tall={tall}
      share={<ShareButton template={template} />}
      folded={draft.photos.photos.length > 0}
      picker={<SetStrip set={set} value={template.id} onChange={choose} />}
      sample={<Sample template={template} tall={tall} />}
      form={<SetFormBody template={template} draft={draft} set={set} frame={frame} forms={forms} tier={context.tier} onClose={onClose} />}
      bar={guest ? guest.bar(template) : <FormAction state={draft.state} resolution={draft.values.resolution} batch={draft.photos.batchMax > 1} onGenerate={generate} placement="sheet" limit={context.concurrency.limit} privateOnly={template.privateOnly} examplesLeft={draft.examplesLeft} orgOnly={draft.choice.orgOnly} />}
    />
  )
}

// The set's members to switch between; none for a lone template.
function SetStrip({ set, value, onChange }: { set: TemplateSet; value: string; onChange(id: string): void }) {
  const t = useTranslations('app.series')
  if (!set.kind) return null
  return <MemberPicker label={t('members', { name: set.name, count: set.members.length })} badge={set.kind} members={set.members} value={value} onChange={onChange} />
}

type FormBodyProps = { template: CatalogueTemplate; draft: WorkspaceDraft; set: TemplateSet; frame: SetFrame | undefined; forms: ReturnType<typeof useCatalogueForms>; tier: CreateContext['tier']; onClose(): void }

// The shared form, with what the frame adds over it and under the photo. Signed out (a guest
// frame) it has no balance line.
function SetFormBody({ template, draft, set, frame, forms, tier, onClose }: FormBodyProps) {
  return (
    <>
      {template.formDeferred ? null : frame?.tools?.({ template, draft, set })}
      <WorkspaceForm
        key={template.id}
        template={template}
        balance={frame?.guest ? null : draft.choice.balance}
        tier={tier}
        photos={draft.photos}
        slots={draft.slots}
        values={draft.values}
        onChange={draft.change}
        surface="create_dialog"
        examples={draft.fromExamples}
        detailsStatus={template.formDeferred && <CatalogueFormStatus failed={forms.failed} retry={forms.retry} />}
        photoExtra={frame?.photoExtra?.({ template, draft, onClose })}
      />
    </>
  )
}

// Generate queues the photo in the app-wide generation store (reserve → generate, the workspace's
// own path) and moves to the chosen member's workspace page, kept prefetched while the dialog is
// open, which shows it developing.
function useGenerate(templateId: string, warm: boolean, draft: WorkspaceDraft, onClose: () => void) {
  const router = useRouter()
  const workspace = `/generate/${templateId}`
  useWarmRoute(workspace, warm)
  const submitOnce = useSubmitOnce(warm)
  return () => {
    // The dialog stays on screen while it closes: a second press must not queue a second photo.
    if (!submitOnce()) return
    void draft.start()
    onClose()
    router.push(workspace, { transitionTypes: navTypesFor(workspace) })
  }
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
