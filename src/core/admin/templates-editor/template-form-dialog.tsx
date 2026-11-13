'use client'

import { useState } from 'react'
import { providerFloor, type ProviderFloors } from '@/core/templates/provider-pricing'

import { Dialog, DialogContent } from '@/core/ui/dialog'

import type { ImageProviderOption } from '../image-provider-field'
import type { AdminTemplate, CoverLanguage, SaveTemplatePayload, TemplateAdminActions } from '../templates/types'
import { TEST_RUN_COPY, TestRunPanel } from '../test-run-ui'

import type { CategoryOption } from './category-field'
import { EditorSidePanel } from './editor-side-panel'
import { buildPayload, emptyFormValues, toFormValues } from './form-state'
import { previewDraft } from './preview-draft'
import type { VersionActions } from './prompt-history'
import { FormColumn } from './template-form-column'

export type EditTarget = { mode: 'new' } | { mode: 'edit'; template: AdminTemplate; previousStandard?: number | null }

type Props = {
  providers: readonly ImageProviderOption[]
  target: EditTarget
  floor: ProviderFloors
  categories: readonly CategoryOption[]
  series: readonly { id: string; nameZh: string; nameEn?: string }[]
  // Every template, for the live preview's series panel.
  templates: readonly AdminTemplate[]
  coverLanguages: readonly CoverLanguage[]
  coverActions: Pick<TemplateAdminActions, 'requestCoverUpload' | 'applyCover' | 'setSale'> & VersionActions
  pending: boolean
  error: string | null
  // The last save's success line, shown by the save button (the dialog stays open after a save).
  notice?: string | null
  onCancel: () => void
  onSubmit: (payload: SaveTemplatePayload, saved: (version?: number) => void) => void
}

// Mounted fresh per target (keyed by the container), so initial state comes straight from props.
export function TemplateFormDialog({ target, providers, floor: allFloors, categories, series, templates, coverLanguages, coverActions, pending, error, notice, onCancel, onSubmit }: Props) {
  const isNew = target.mode === 'new'
  const [values, setValues] = useState(() =>
    target.mode === 'edit' ? toFormValues(target.template) : emptyFormValues(),
  )
  const [localError, setLocalError] = useState<string | null>(null)
  // Only this dialog's own save shows its success line, not an earlier action's notice.
  const [submitted, setSubmitted] = useState(false)
  const onChange = (patch: Partial<typeof values>) => setValues((prev) => ({ ...prev, ...patch }))

  const floor = providerFloor(allFloors, values.providerId, values.id)
  const submit = () => {
    const result = buildPayload(values, isNew, floor)
    if (!result.ok) {
      setLocalError(result.message)
      return
    }
    setLocalError(null)
    setSubmitted(true)
    onSubmit(result.payload, version => setValues(now => ({
      ...now, originalCategory: values.category, originalSeriesId: values.seriesId, expectedVersion: version ?? now.expectedVersion,
      selectedVersion: now.selectedVersion === values.selectedVersion ? undefined : now.selectedVersion,
      styleRefsEdited: now.styleRefs !== values.styleRefs && now.styleRefsEdited,
    })))
  }

  const shownError = localError ?? error ?? null
  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      {/* Two columns from lg (ARCHITECTURE §10.b: 「试跑」 on the right), each scrolling on its own;
          one scrolling column below that. */}
      <DialogContent className="max-h-[92vh] gap-0 overflow-y-auto p-0 sm:max-w-[min(1400px,96vw)] lg:h-[92vh] lg:overflow-clip">
        <div className="grid min-h-0 grid-cols-1 lg:h-full lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
          <FormColumn existing={target.mode === 'edit' ? target.template : null} {...{ providers, values, floor, categories, series, coverLanguages, coverActions, onChange }}
            footer={{ pending, error: shownError, saved: submitted ? (notice ?? null) : null, onCancel, onSave: submit }} />
          <aside className="bg-muted/20 min-h-0 border-t p-6 lg:overflow-y-auto lg:border-t-0 lg:border-l">
            <EditorSidePanel isActive={target.mode === 'edit' && target.template.isActive}
              draft={target.mode === 'edit' ? previewDraft(values, target.template, { categories, templates, series }) : null}
              testRun={target.mode === 'edit' ? <TestRunPanel providers={providers} template={target.template} languages={coverLanguages} /> : <NewTemplateNote />} />
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function NewTemplateNote() {
  return (
    <div className="grid gap-1">
      <h2 className="text-base font-semibold">{TEST_RUN_COPY.title}</h2>
      <p className="text-muted-foreground text-sm">{TEST_RUN_COPY.newTemplate}</p>
    </div>
  )
}

