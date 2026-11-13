'use client'

import { Checkbox } from '@/core/ui/checkbox'
import { Input } from '@/core/ui/input'
import { Label } from '@/core/ui/label'
import { TEMPLATE_DESCRIPTION_MAX } from '@/core/templates/schema'

import { publicCopy, styleRefCopy } from './copy'
import type { TemplateFormValues } from './form-state'
import { ChinesePublicFields } from './template-translation-fields'

type Props = {
  values: TemplateFormValues
  isNew: boolean
  uploading: boolean
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

// templates.description (T52): the English one-liner, under the English name, with a counter.
function DescriptionField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="grid gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <Label htmlFor="tpl-description">{publicCopy.description}</Label>
        <span className="text-muted-foreground font-mono text-xs" aria-live="polite">
          {value.length} / {TEMPLATE_DESCRIPTION_MAX}
        </span>
      </div>
      <Input id="tpl-description" value={value} maxLength={TEMPLATE_DESCRIPTION_MAX} onChange={(event) => onChange(event.target.value)} />
      <p className="text-muted-foreground text-xs">{publicCopy.descriptionHint}</p>
    </div>
  )
}

export function TemplatePublicFields({ values, isNew, uploading, onChange }: Props) {
  const lockNewId = uploading || values.styleRefs.length > 0
  return (
    <fieldset className="grid gap-3">
      <div className="grid gap-3">
        <TextField id="id" label="ID（小写字母、数字、短横线，创建后不可改）" value={values.id}
          disabled={!isNew || lockNewId} onChange={(id) => onChange({ id })} />
        <TextField id="name" label={publicCopy.name} value={values.name} onChange={(name) => onChange({ name })} />
      </div>
      {isNew && lockNewId && <p className="text-muted-foreground text-xs">{styleRefCopy.idLocked}</p>}
      <DescriptionField value={values.description} onChange={(description) => onChange({ description })} />
      <ChinesePublicFields values={values} onChange={onChange} />
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
    </fieldset>
  )
}
