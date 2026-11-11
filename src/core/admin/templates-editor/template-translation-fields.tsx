'use client'

import { Input } from '@/core/ui/input'
import { Label } from '@/core/ui/label'

import { zhCopy } from './copy'
import type { TemplateFormValues, ZhFormValues } from './form-state'

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

// templates.translations.zh name and one-liner (ARCHITECTURE §5), beside the English ones. The
// English is shown as the placeholder so a blank is clearly a fallback; field text is on the
// field cards.
export function ChinesePublicFields({ values, onChange }: Props) {
  const set = (patch: Partial<ZhFormValues>) => onChange({ zh: { ...values.zh, ...patch } })
  return <>
    <ZhInput id="tpl-zh-name" label={zhCopy.name} value={values.zh.name} placeholder={values.name}
      onChange={name => set({ name })} />
    <ZhInput id="tpl-zh-description" label={zhCopy.description} value={values.zh.description} placeholder={values.description}
      onChange={description => set({ description })} />
  </>
}
