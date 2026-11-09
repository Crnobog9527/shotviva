'use client'

import { useState } from 'react'
import { providerFloor, type ProviderFloors } from '@/core/templates/provider-pricing'

import { Button } from '@/core/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/core/ui/dialog'

import { ImageProviderField, type ImageProviderOption } from '../image-provider-field'
import type { AdminTemplate, CoverLanguage, SaveTemplatePayload, TemplateAdminActions } from '../templates/types'
import { TEST_RUN_COPY, TestRunPanel } from '../test-run-ui'

import type { CategoryOption } from './category-field'
import { buildPayload, emptyFormValues, toFormValues, type TemplateFormValues } from './form-state'
import { TemplateCoverFields } from './template-cover-fields'
import { TemplatePromptFields } from './template-prompt-fields'
import { TemplatePublicFields } from './template-public-fields'
import { TemplateToggleFields } from './template-toggle-fields'
import { TemplateTranslationFields } from './template-translation-fields'

export type EditTarget = { mode: 'new' } | { mode: 'edit'; template: AdminTemplate }

type Props = {
  providers: readonly ImageProviderOption[]
  target: EditTarget
  floor: ProviderFloors
  categories: readonly CategoryOption[]
  coverLanguages: readonly CoverLanguage[]
  coverActions: Pick<TemplateAdminActions, 'requestCoverUpload' | 'applyCover'>
  pending: boolean
  error: string | null
  // The last save's success line, shown by the save button (the dialog stays open after a save).
  notice?: string | null
  onCancel: () => void
  onSubmit: (payload: SaveTemplatePayload) => void
}

// Mounted fresh per target (keyed by the container), so initial state comes straight from props.
export function TemplateFormDialog({ target, providers, floor: allFloors, categories, coverLanguages, coverActions, pending, error, notice, onCancel, onSubmit }: Props) {
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
    onSubmit(result.payload)
  }

  const shownError = localError ?? error ?? null
  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      {/* Two columns from lg (ARCHITECTURE §10.b: 「试跑」 on the right), each scrolling on its own;
          one scrolling column below that. */}
      <DialogContent className="max-h-[92vh] gap-0 overflow-y-auto p-0 sm:max-w-[min(1400px,96vw)] lg:h-[92vh] lg:overflow-clip">
        <div className="grid min-h-0 lg:h-full lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
          <FormColumn {...{ target, providers, values, isNew, floor, categories, coverLanguages, coverActions, onChange, pending, onCancel }} error={shownError} saved={submitted ? (notice ?? null) : null} onSave={submit} />
          <aside className="bg-muted/20 min-h-0 border-t p-6 lg:overflow-y-auto lg:border-t-0 lg:border-l">
            {target.mode === 'edit' ? <TestRunPanel providers={providers} template={target.template} languages={coverLanguages} /> : <NewTemplateNote />}
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

type FormColumnProps = Pick<Props, 'target' | 'providers' | 'floor' | 'categories' | 'coverLanguages' | 'coverActions' | 'pending' | 'onCancel'> & {
  values: TemplateFormValues
  isNew: boolean
  error: string | null
  // This dialog's own last save, shown by the button (the dialog stays open after a save).
  saved: string | null
  onChange: (patch: Partial<TemplateFormValues>) => void
  onSave: () => void
}

function FormColumn({ target, providers, values, isNew, floor, categories, coverLanguages, coverActions, pending, error, saved, onChange, onCancel, onSave }: FormColumnProps) {
  const existing = target.mode === 'edit' ? target.template : null
  return (
    <div className="grid min-h-0 content-start gap-4 p-6 lg:overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{existing ? `编辑「${existing.name}」` : '新建模板'}</DialogTitle>
      </DialogHeader>
      <TemplatePublicFields values={values} isNew={isNew} floor={floor} categories={categories} onChange={onChange} />
      <TemplateTranslationFields values={values} onChange={onChange} />
      {existing ? (
        <TemplateCoverFields template={existing} languages={coverLanguages} actions={coverActions} />
      ) : (
        <p className="text-muted-foreground text-xs">保存模板后再打开编辑，即可上传封面。</p>
      )}
      {values.module === 'image' && (
        <ImageProviderField id="tpl-provider" providers={providers} value={values.providerId} onChange={(providerId) => onChange({ providerId })} />
      )}
      <TemplatePromptFields values={values} version={existing?.prompt?.version ?? null} onChange={onChange} />
      <TemplateToggleFields values={values} onChange={onChange} />
      {isNew ? <p className="text-muted-foreground text-xs">新模板保存后默认是下架状态，保存后留在这里，右侧就能试跑。</p> : null}
      <FormFooter pending={pending} error={error} saved={saved} onCancel={onCancel} onSave={onSave} />
    </div>
  )
}

function FormFooter({ pending, error, saved, onCancel, onSave }: Pick<FormColumnProps, 'pending' | 'error' | 'saved' | 'onCancel' | 'onSave'>) {
  return (
    <>
      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
      <DialogFooter className="items-center">
        {saved && !error && !pending ? <p className="text-sm text-emerald-700 sm:mr-auto dark:text-emerald-400">{saved}</p> : null}
        <Button variant="outline" onClick={onCancel} disabled={pending}>
          关闭
        </Button>
        <Button onClick={onSave} disabled={pending}>
          {pending ? '保存中…' : '保存'}
        </Button>
      </DialogFooter>
    </>
  )
}
