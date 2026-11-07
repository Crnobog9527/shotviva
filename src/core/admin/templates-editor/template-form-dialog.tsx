'use client'

import { useState } from 'react'

import { Button } from '@/core/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/core/ui/dialog'
import type { CreditsFloor } from '@/core/templates/pricing'

import type { AdminTemplate, SaveTemplatePayload, TemplateAdminActions } from '../templates/types'

import type { CategoryOption } from './category-field'
import { buildPayload, emptyFormValues, toFormValues } from './form-state'
import { TemplateCoverFields } from './template-cover-fields'
import { TemplatePromptFields } from './template-prompt-fields'
import { TemplatePublicFields } from './template-public-fields'
import { TemplateTranslationFields } from './template-translation-fields'

export type EditTarget = { mode: 'new' } | { mode: 'edit'; template: AdminTemplate }

type Props = {
  target: EditTarget
  floor: CreditsFloor
  categories: readonly CategoryOption[]
  coverActions: Pick<TemplateAdminActions, 'requestCoverUpload' | 'applyCover'>
  pending: boolean
  error: string | null
  onCancel: () => void
  onSubmit: (payload: SaveTemplatePayload) => void
}

// Mounted fresh per target (keyed by the container), so initial state comes straight from props.
export function TemplateFormDialog({ target, floor, categories, coverActions, pending, error, onCancel, onSubmit }: Props) {
  const isNew = target.mode === 'new'
  const [values, setValues] = useState(() =>
    target.mode === 'edit' ? toFormValues(target.template) : emptyFormValues(),
  )
  const [localError, setLocalError] = useState<string | null>(null)
  const onChange = (patch: Partial<typeof values>) => setValues((prev) => ({ ...prev, ...patch }))

  const submit = () => {
    const result = buildPayload(values, isNew, floor)
    if (!result.ok) {
      setLocalError(result.message)
      return
    }
    setLocalError(null)
    onSubmit(result.payload)
  }

  const shownError = localError ?? error
  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{isNew ? '新建模板' : `编辑「${target.template.name}」`}</DialogTitle>
        </DialogHeader>
        <TemplatePublicFields values={values} isNew={isNew} floor={floor} categories={categories} onChange={onChange} />
        <TemplateTranslationFields values={values} onChange={onChange} />
        {target.mode === 'edit' ? (
          <TemplateCoverFields template={target.template} actions={coverActions} />
        ) : (
          <p className="text-muted-foreground text-xs">保存模板后再打开编辑，即可上传封面。</p>
        )}
        <TemplatePromptFields
          values={values}
          version={target.mode === 'edit' ? (target.template.prompt?.version ?? null) : null}
          onChange={onChange}
        />
        {isNew ? <p className="text-muted-foreground text-xs">新模板保存后默认是下架状态。</p> : null}
        {shownError ? (
          <p role="alert" className="text-destructive text-sm">
            {shownError}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={pending}>
            取消
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? '保存中…' : '保存'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
