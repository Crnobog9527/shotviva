'use client'

import { useTranslations } from 'next-intl'

import { useRouter } from '@/core/i18n'

import type { CatalogueTemplate } from '../catalogue/catalogue-template'
import { useCategoryLabel } from '../catalogue/category-label'
import { isCompareSample, TemplateSample } from '../catalogue/template-sample'
import { CreateSheet } from './create-sheet'
import { FormAction } from './form-action'
import { useWorkspaceDraft, type DraftInput } from './use-workspace-draft'
import { WorkspaceForm } from './workspace-form'

export type CreateContext = Omit<DraftInput, 'template'>

type Props = CreateContext & { template: CatalogueTemplate | null; onClose(): void }

// Tapping a template opens this straight away (DESIGN §6.9 item 2: no "use this template?"
// step): the template's sample on one side and the creation form on the other, the same form
// the workspace page renders. Generate queues the photo and goes to that template's workspace
// page, which shows it developing; the jobs run in the app-wide generation store, so the move
// does not interrupt them.
export function CreateDialog({ template, onClose, ...context }: Props) {
  // A new template starts a new draft: the body remounts per template.
  return template ? <CreateBody key={template.id} template={template} onClose={onClose} {...context} /> : null
}

function CreateBody({ template, onClose, ...context }: CreateContext & { template: CatalogueTemplate; onClose(): void }) {
  const t = useTranslations('app.template')
  const label = useCategoryLabel()
  const router = useRouter()
  const draft = useWorkspaceDraft({ template, ...context })
  const tall = isCompareSample(template)
  const generate = () => {
    draft.start()
    onClose()
    router.push(`/generate/${template.id}`)
  }
  return (
    <CreateSheet
      open
      onOpenChange={(open) => !open && onClose()}
      title={template.name}
      description={[label(template.category), template.description].filter(Boolean).join(' · ')}
      hint={t(tall ? 'hintCompare' : 'hintPair')}
      tall={tall}
      folded={draft.photos.photos.length > 0}
      sample={<TemplateSample template={template} className="max-md:h-full max-md:aspect-auto" />}
      form={<WorkspaceForm template={template} balance={context.balance} tier={context.tier} photos={draft.photos} values={draft.values} onChange={draft.change} />}
      bar={<FormAction state={draft.state} resolution={draft.values.resolution} batch={draft.photos.batchMax > 1} onGenerate={generate} placement="sheet" />}
    />
  )
}
