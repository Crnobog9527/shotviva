'use client'

import type { CopyField } from '@/core/templates/copy-fields'
import { Input } from '@/core/ui/input'
import { Label } from '@/core/ui/label'
import { Textarea } from '@/core/ui/textarea'

type Props = { fields: readonly CopyField[]; values: Record<string, string>; onChange(next: Record<string, string>): void }

// The template's text fields in the 试跑 form, drawn for their type (ARCHITECTURE §5.1d) so a
// choice is picked from its list rather than typed; the server checks the same rules.
export function TestCopyFields({ fields, values, onChange }: Props) {
  return (
    <>
      {fields.map((field) => {
        const id = `test-copy-${field.key}`
        const value = values[field.key] ?? ''
        const set = (next: string) => onChange({ ...values, [field.key]: next })
        return (
          <div key={field.key} className="grid gap-1.5">
            <Label htmlFor={id}>
              {field.label}
              {field.required ? ' *' : ''}
            </Label>
            <FieldInput field={field} id={id} value={value} onChange={set} />
          </div>
        )
      })}
    </>
  )
}

function FieldInput({ field, id, value, onChange }: { field: CopyField; id: string; value: string; onChange(next: string): void }) {
  if (field.type === 'select') {
    return (
      <select id={id} className="border-input h-9 rounded-md border bg-transparent px-3 text-sm" value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">—</option>
        {(field.options ?? []).map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    )
  }
  if (field.type === 'long') {
    return <Textarea id={id} rows={3} maxLength={field.maxLength} placeholder={field.placeholder} value={value} onChange={(event) => onChange(event.target.value)} />
  }
  return (
    <Input id={id} maxLength={field.maxLength} placeholder={field.placeholder} inputMode={field.type === 'number' ? 'decimal' : undefined}
      value={value} onChange={(event) => onChange(event.target.value)} />
  )
}
