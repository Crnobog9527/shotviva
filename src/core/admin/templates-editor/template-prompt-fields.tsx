'use client'

import { Label } from '@/core/ui/label'
import { Textarea } from '@/core/ui/textarea'

import type { TemplateFormValues } from './form-state'

type Props = {
  values: TemplateFormValues
  version: number | null
  onChange: (patch: Partial<TemplateFormValues>) => void
}

export function TemplatePromptFields({ values, version, onChange }: Props) {
  return (
    <fieldset className="grid gap-3 rounded-md border border-dashed p-3">
      <legend className="px-1 text-sm font-semibold">
        私有提示词（只存服务端，用户看不到）{version ? ` · 当前 v${version}` : ''}
      </legend>
      <div className="grid gap-1.5">
        <Label htmlFor="tpl-promptBody">提示词正文</Label>
        <Textarea id="tpl-promptBody" className="min-h-40 font-mono text-xs" value={values.promptBody}
          onChange={(event) => onChange({ promptBody: event.target.value })} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="tpl-modelParamsJson">模型参数（JSON）</Label>
        <Textarea id="tpl-modelParamsJson" className="min-h-16 font-mono text-xs"
          value={values.modelParamsJson}
          onChange={(event) => onChange({ modelParamsJson: event.target.value })} />
      </div>
    </fieldset>
  )
}
