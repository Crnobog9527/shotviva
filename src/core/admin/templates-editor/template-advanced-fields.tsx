'use client'

import { Checkbox } from '@/core/ui/checkbox'
import { Label } from '@/core/ui/label'
import { Textarea } from '@/core/ui/textarea'

import type { TemplateFormValues } from './form-state'
import { ratiosLocked, withRatiosLocked } from './lock-ratios'

type Props = { values: TemplateFormValues; onChange: (patch: Partial<TemplateFormValues>) => void }

// The raw fields JSON (images / aspectRatios), in the editor's 高级 section: the text fields, image
// slots and toggles in it have their own cards. The lock checkbox writes into the same JSON.
export function TemplateAdvancedFields({ values, onChange }: Props) {
  const locked = ratiosLocked(values.fieldsJson)
  return (
    <div className="grid gap-1.5">
      <Label htmlFor="tpl-fieldsJson">字段定义（JSON：images / aspectRatios；不锁定比例时 aspectRatios 只对伙伴接口和 1:2、1:3 生效，站内按出图模型支持的比例显示。用户填写的字段、图片格子和开关在「创作页字段与开关」里单独编辑）</Label>
      <Textarea id="tpl-fieldsJson" className="min-h-32 font-mono text-xs" value={values.fieldsJson}
        onChange={(event) => onChange({ fieldsJson: event.target.value })} />
      <label className="flex items-start gap-2 text-sm">
        <Checkbox className="mt-0.5" checked={locked === true} disabled={locked === null}
          onCheckedChange={(checked) => onChange({ fieldsJson: withRatiosLocked(values.fieldsJson, checked === true) })} />
        <span>锁定比例：创作页只给 aspectRatios 里出图模型支持的比例，不给「跟随照片」（封面是固定版式的模板用，如奖励海报）</span>
      </label>
    </div>
  )
}
