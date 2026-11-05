'use client'

import { Checkbox } from '@/core/ui/checkbox'
import { Input } from '@/core/ui/input'
import { Label } from '@/core/ui/label'
import { Textarea } from '@/core/ui/textarea'

import type { TemplateFormValues } from './form-state'

type Props = {
  values: TemplateFormValues
  isNew: boolean
  onChange: (patch: Partial<TemplateFormValues>) => void
}

function TextField(props: {
  id: keyof TemplateFormValues
  label: string
  value: string
  disabled?: boolean
  onChange: (value: string) => void
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={`tpl-${props.id}`}>{props.label}</Label>
      <Input
        id={`tpl-${props.id}`}
        value={props.value}
        disabled={props.disabled}
        onChange={(event) => props.onChange(event.target.value)}
      />
    </div>
  )
}

export function TemplatePublicFields({ values, isNew, onChange }: Props) {
  return (
    <fieldset className="grid gap-3">
      <legend className="mb-1 text-sm font-semibold">公开信息</legend>
      <div className="grid grid-cols-2 gap-3">
        <TextField id="id" label="ID（小写字母、数字、短横线，创建后不可改）" value={values.id}
          disabled={!isNew} onChange={(id) => onChange({ id })} />
        <TextField id="name" label="名称" value={values.name} onChange={(name) => onChange({ name })} />
        <TextField id="category" label="分类" value={values.category}
          onChange={(category) => onChange({ category })} />
        <TextField id="creditsCost" label="消耗积分" value={values.creditsCost}
          onChange={(creditsCost) => onChange({ creditsCost })} />
        <TextField id="coverBeforeUrl" label="封面：原图 URL" value={values.coverBeforeUrl}
          onChange={(coverBeforeUrl) => onChange({ coverBeforeUrl })} />
        <TextField id="coverAfterUrl" label="封面：成品 URL" value={values.coverAfterUrl}
          onChange={(coverAfterUrl) => onChange({ coverAfterUrl })} />
      </div>
      <div className="flex items-center gap-6 text-sm">
        <span>展示入口</span>
        <label className="flex items-center gap-2">
          <Checkbox checked={values.visibleWeb}
            onCheckedChange={(checked) => onChange({ visibleWeb: checked === true })} />
          站内（web）
        </label>
        <label className="flex items-center gap-2">
          <Checkbox checked={values.visiblePartner}
            onCheckedChange={(checked) => onChange({ visiblePartner: checked === true })} />
          伙伴（partner）
        </label>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="tpl-fieldsJson">字段定义（JSON：images / copy / aspectRatios）</Label>
        <Textarea id="tpl-fieldsJson" className="min-h-32 font-mono text-xs" value={values.fieldsJson}
          onChange={(event) => onChange({ fieldsJson: event.target.value })} />
      </div>
    </fieldset>
  )
}
