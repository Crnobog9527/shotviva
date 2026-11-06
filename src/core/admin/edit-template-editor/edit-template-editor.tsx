'use client'

import { useState } from 'react'

import { Button } from '@/core/ui/button'
import { DECIDED_SCOPES, EDIT_SCOPES } from '@/core/templates/edit-params'
import type { CreditsFloor } from '@/core/templates/pricing'

import type { EditTemplateSettings, SaveEditTemplateInput } from '../edit-template/schema'
import type { ActionResult } from '../templates/types'
import { useTemplateActions } from '../templates-editor/use-template-actions'

import { BasicsFields } from './basics-fields'
import { EDIT_TEMPLATE_COPY as COPY } from './copy'
import { formFor, missingQuestions, toSaveInput, type EditTemplateForm } from './form-state'
import { ScopeTextFields } from './scope-text-fields'

type Props = {
  settings: EditTemplateSettings
  floor: CreditsFloor
  save: (input: SaveEditTemplateInput) => Promise<ActionResult>
}

// /admin/templates/edit (ARCHITECTURE §5.2): switch, price, wrapper, the five questions and the
// six paragraphs of the built-in edit template, saved together.
export function EditTemplateEditor({ settings, floor, save }: Props) {
  const [form, setForm] = useState(() => formFor(settings))
  const { pending, error, notice, run } = useTemplateActions()
  const patch = (next: Partial<EditTemplateForm>) => setForm((prev) => ({ ...prev, ...next }))
  const missing = missingQuestions(form)
  return (
    <div className="grid gap-4">
      <p className="text-muted-foreground text-sm">{COPY.intro}</p>
      <BasicsFields form={form} floor={floor[settings.quality]} version={settings.version} onChange={patch} />
      <ScopeTextFields legend={COPY.questions} idPrefix="edit-question" scopes={DECIDED_SCOPES} values={form.questions} invalid={missing}
        onChange={(scope, value) => patch({ questions: { ...form.questions, [scope]: value } })} />
      <ScopeTextFields legend={COPY.constraints} idPrefix="edit-constraint" scopes={EDIT_SCOPES} values={form.constraints}
        onChange={(scope, value) => patch({ constraints: { ...form.constraints, [scope]: value } })} />
      {notice ? <p className="text-sm text-emerald-700">{notice}</p> : null}
      {error ? <p role="alert" className="text-destructive text-sm">{error}</p> : null}
      <div className="flex">
        <Button className="ml-auto" disabled={pending || missing.length > 0 || form.wrapper.trim() === ''}
          onClick={() => run(() => save(toSaveInput(form)), COPY.saved)}>
          {COPY.save}
        </Button>
      </div>
    </div>
  )
}
