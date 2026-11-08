'use client'

import { useState } from 'react'

import { Button } from '@/core/ui/button'
import { EDIT_SCOPES } from '@/core/templates/edit-params'
import { Label } from '@/core/ui/label'
import { Textarea } from '@/core/ui/textarea'
import type { CreditsFloor } from '@/core/templates/pricing'

import type { EditTemplateSettings, SaveEditTemplateInput } from '../edit-template/schema'
import type { ActionResult } from '../templates/types'
import { useTemplateActions } from '../templates-editor/use-template-actions'

import { BasicsFields } from './basics-fields'
import { EDIT_TEMPLATE_COPY as COPY } from './copy'
import { canSave, formFor, toSaveInput, type EditTemplateForm } from './form-state'
import { ScopeTextFields } from './scope-text-fields'

type Props = {
  settings: EditTemplateSettings
  floor: CreditsFloor
  save: (input: SaveEditTemplateInput) => Promise<ActionResult>
}

// /admin/templates/edit (ARCHITECTURE §5.2): switch, price, wrapper, the classifier instructions
// the six paragraphs and the reframe paragraph of the built-in edit template, saved together.
export function EditTemplateEditor({ settings, floor, save }: Props) {
  const [form, setForm] = useState(() => formFor(settings))
  const { pending, error, notice, run } = useTemplateActions()
  const patch = (next: Partial<EditTemplateForm>) => setForm((prev) => ({ ...prev, ...next }))
  return (
    <div className="grid gap-4">
      <p className="text-muted-foreground text-sm">{COPY.intro}</p>
      <BasicsFields form={form} floor={floor[settings.quality]} version={settings.version} onChange={patch} />
      <div className="grid gap-1.5 rounded-md border border-dashed p-3">
        <Label htmlFor="edit-classifier">{COPY.classifier}</Label>
        <Textarea id="edit-classifier" className="min-h-40 font-mono text-xs" value={form.classifier} onChange={(event) => patch({ classifier: event.target.value })} />
        <p className="text-muted-foreground text-xs">{COPY.classifierHint}</p>
      </div>
      <ScopeTextFields legend={COPY.constraints} idPrefix="edit-constraint" scopes={EDIT_SCOPES} values={form.constraints}
        onChange={(scope, value) => patch({ constraints: { ...form.constraints, [scope]: value } })} />
      <div className="grid gap-1.5 rounded-md border border-dashed p-3">
        <Label htmlFor="edit-reframe">{COPY.reframe}</Label>
        <Textarea id="edit-reframe" className="min-h-20 font-mono text-xs" value={form.reframe} onChange={(event) => patch({ reframe: event.target.value })} />
        <p className="text-muted-foreground text-xs">{COPY.reframeHint}</p>
      </div>
      <div className="grid gap-1.5 rounded-md border border-dashed p-3">
        <Label htmlFor="edit-cover-translate">{COPY.coverTranslate}</Label>
        <Textarea id="edit-cover-translate" className="min-h-20 font-mono text-xs" value={form.coverTranslate} onChange={(event) => patch({ coverTranslate: event.target.value })} />
        <p className="text-muted-foreground text-xs">{COPY.coverTranslateHint}</p>
      </div>
      {notice ? <p className="text-sm text-emerald-700">{notice}</p> : null}
      {error ? <p role="alert" className="text-destructive text-sm">{error}</p> : null}
      <div className="flex">
        <Button className="ml-auto" disabled={pending || !canSave(form)}
          onClick={() => run(() => save(toSaveInput(form)), COPY.saved)}>
          {COPY.save}
        </Button>
      </div>
    </div>
  )
}
