'use client'

import { Label } from '@/core/ui/label'
import { Textarea } from '@/core/ui/textarea'

import type { TemplateFormValues } from './form-state'

type Props = { values: TemplateFormValues; onChange: (patch: Partial<TemplateFormValues>) => void }

// The raw fields JSON (images / aspectRatios), in the editor's 高级 section: the text fields, image
// slots and toggles in it have their own cards.
export function TemplateAdvancedFields({ values, onChange }: Props) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor="tpl-fieldsJson">字段定义（JSON：images / aspectRatios；aspectRatios 只对伙伴接口生效，站内按出图模型支持的比例显示。用户填写的字段、图片格子和开关在「创作页字段与开关」里单独编辑）</Label>
      <Textarea id="tpl-fieldsJson" className="min-h-32 font-mono text-xs" value={values.fieldsJson}
        onChange={(event) => onChange({ fieldsJson: event.target.value })} />
    </div>
  )
}
