'use client'

import { Input } from '@/core/ui/input'
import { Label } from '@/core/ui/label'

import { zhCopy } from './copy'
import { copyKeys, type TemplateFormValues, type ZhFormValues } from './form-state'

type Props = { values: TemplateFormValues; onChange: (patch: Partial<TemplateFormValues>) => void }

function ZhInput({ id, label, value, placeholder, onChange }: {
  id: string
  label: string
  value: string
  placeholder?: string
  onChange: (value: string) => void
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </div>
  )
}

// templates.translations.zh (ARCHITECTURE §5): name, an optional one-liner and the copy fields'
// label / placeholder. The English is shown as the placeholder so a blank is clearly a fallback.
export function TemplateTranslationFields({ values, onChange }: Props) {
  const zh = values.zh
  const set = (patch: Partial<ZhFormValues>) => onChange({ zh: { ...zh, ...patch } })
  const setField = (key: string, patch: Partial<{ label: string; placeholder: string }>) => {
    const current = zh.fields[key] ?? { label: '', placeholder: '' }
    set({ fields: { ...zh.fields, [key]: { ...current, ...patch } } })
  }
  const fields = copyKeys(values.fieldsJson)
  return (
    <fieldset className="grid gap-3">
      <legend className="mb-1 text-sm font-semibold">{zhCopy.legend}</legend>
      <p className="text-muted-foreground text-xs">{zhCopy.hint}</p>
      {fields.length === 0 ? <p className="text-muted-foreground text-xs">{zhCopy.noFields}</p> : null}
      {fields.map((field) => (
        <div key={field.key} className="grid grid-cols-2 gap-3">
          <ZhInput id={`tpl-zh-${field.key}-label`} label={zhCopy.fieldLabel(field.key)} placeholder={field.label}
            value={zh.fields[field.key]?.label ?? ''} onChange={(label) => setField(field.key, { label })} />
          <ZhInput id={`tpl-zh-${field.key}-placeholder`} label={zhCopy.fieldPlaceholder(field.key)}
            value={zh.fields[field.key]?.placeholder ?? ''} onChange={(placeholder) => setField(field.key, { placeholder })} />
        </div>
      ))}
    </fieldset>
  )
}

export function ChinesePublicFields({ values, onChange }: Props) {
  const set = (patch: Partial<ZhFormValues>) => onChange({ zh: { ...values.zh, ...patch } })
  return <>
    <ZhInput id="tpl-zh-name" label={zhCopy.name} value={values.zh.name} placeholder={values.name}
      onChange={name => set({ name })} />
    <ZhInput id="tpl-zh-description" label={zhCopy.description} value={values.zh.description} placeholder={values.description}
      onChange={description => set({ description })} />
  </>
}
