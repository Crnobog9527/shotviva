'use client'

import { Button } from '@/core/ui/button'
import { Checkbox } from '@/core/ui/checkbox'
import { Input } from '@/core/ui/input'
import { Label } from '@/core/ui/label'
import { COPY_DEFAULT_LENGTH, COPY_FIELD_TYPES, COPY_FIELDS_MAX, COPY_OPTIONS_MAX, type CopyFieldType } from '@/core/templates/copy-fields'
import { PROMPT_MAX_LENGTH } from '@/core/templates/generation-inputs'
import { NOTE_MAX_LENGTH } from '@/core/templates/output-options'

import { copyFieldCopy as COPY } from './copy'
import { emptyCopyField, type CopyFormValue } from './copy-form-state'
import type { TemplateFormValues } from './form-state'

type Props = { values: TemplateFormValues; onChange: (patch: Partial<TemplateFormValues>) => void }

// The longest prompt these fields could make: the body plus every field filled to its limit as
// a "Label: value" line, the note and the image list. Past PROMPT_MAX_LENGTH a user's run is
// refused before any charge (§5.1d), so the editor warns (yellow, never blocks the save).
export function worstPromptLength(body: string, fields: readonly CopyFormValue[]): number {
  const lines = fields.reduce((sum, field) => sum + field.label.length + 3 + (Number(field.maxLength) || COPY_DEFAULT_LENGTH[field.type]), 0)
  return body.length + lines + NOTE_MAX_LENGTH + 200
}

function Field({ id, label, value, onChange, placeholder, inputMode }: {
  id: string; label: string; value: string; onChange: (value: string) => void; placeholder?: string; inputMode?: 'numeric' | 'decimal'
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value} placeholder={placeholder} inputMode={inputMode} onChange={(event) => onChange(event.target.value)} />
    </div>
  )
}

// Only a valid key is looked up (a half-typed one could be a broken pattern).
const usesPlaceholder = (body: string, key: string) => /^[a-z][a-z0-9_]*$/.test(key) && new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`).test(body)

// The type picker: switching keeps the text and sets the defaults that type needs.
function retyped(field: CopyFormValue, type: CopyFieldType): CopyFormValue {
  const fresh = emptyCopyField(type)
  return { ...field, type, maxLength: fresh.maxLength, options: type === 'select' && field.options.length < 2 ? fresh.options : field.options, min: '', max: '' }
}

function OptionRows({ id, field, set }: { id: string; field: CopyFormValue; set: (patch: Partial<CopyFormValue>) => void }) {
  const options = field.options
  const put = (at: number, patch: Partial<CopyFormValue['options'][number]>) => set({ options: options.map((option, i) => (i === at ? { ...option, ...patch } : option)) })
  return (
    <fieldset className="grid gap-2 rounded-md border p-2">
      <legend className="px-1 text-xs font-medium">{COPY.options}</legend>
      {options.map((option, at) => (
        <div key={at} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
          <Field id={`${id}-opt-${at}`} label={COPY.optionValue(at + 1)} value={option.value} onChange={(value) => put(at, { value })} />
          <Field id={`${id}-opt-${at}-zh`} label={COPY.optionZh(at + 1)} value={option.labelZh} placeholder={option.value} onChange={(labelZh) => put(at, { labelZh })} />
          <Button variant="outline" size="sm" disabled={options.length <= 2} onClick={() => set({ options: options.filter((_, i) => i !== at) })}>{COPY.removeOption}</Button>
        </div>
      ))}
      <Button variant="outline" size="sm" className="justify-self-start" disabled={options.length >= COPY_OPTIONS_MAX}
        onClick={() => set({ options: [...options, { value: '', labelZh: '' }] })}>{COPY.addOption}</Button>
    </fieldset>
  )
}

function TypeRow({ id, field, set }: { id: string; field: CopyFormValue; set: (patch: Partial<CopyFormValue>) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <div className="grid gap-1.5">
        <Label htmlFor={`${id}-type`}>{COPY.type}</Label>
        <select id={`${id}-type`} className="border-input h-9 rounded-md border bg-transparent px-3 text-sm" value={field.type}
          onChange={(event) => set(retyped(field, event.target.value as CopyFieldType))}>
          {COPY_FIELD_TYPES.map((type) => <option key={type} value={type}>{COPY.types[type]}</option>)}
        </select>
      </div>
      {field.type === 'select' ? null : (
        <Field id={`${id}-max-length`} label={COPY.maxLength} inputMode="numeric" value={field.maxLength} placeholder={String(COPY_DEFAULT_LENGTH[field.type])} onChange={(maxLength) => set({ maxLength })} />
      )}
      {field.type === 'number' ? (
        <>
          <Field id={`${id}-min`} label={COPY.min} inputMode="decimal" value={field.min} onChange={(min) => set({ min })} />
          <Field id={`${id}-max`} label={COPY.max} inputMode="decimal" value={field.max} onChange={(max) => set({ max })} />
        </>
      ) : null}
    </div>
  )
}

type CardProps = { index: number; field: CopyFormValue; body: string; onChange: (next: CopyFormValue) => void; onRemove: () => void; onUp?: () => void }

function CopyCard({ index, field, body, onChange, onRemove, onUp }: CardProps) {
  const id = `tpl-copy-${index}`
  const set = (patch: Partial<CopyFormValue>) => onChange({ ...field, ...patch })
  const key = field.key.trim()
  return (
    <div className="grid gap-3 rounded-md border p-3">
      <div className="grid grid-cols-[1fr_auto_auto] items-end gap-2">
        <Field id={`${id}-key`} label={COPY.key} value={field.key} onChange={(value) => set({ key: value })} />
        <Button variant="outline" size="sm" disabled={!onUp} onClick={onUp}>{COPY.up}</Button>
        <Button variant="outline" size="sm" onClick={onRemove}>{COPY.remove}</Button>
      </div>
      {key ? <p className="text-muted-foreground text-xs">{COPY.placement(key, usesPlaceholder(body, key))}</p> : null}
      <TypeRow id={id} field={field} set={set} />
      <div className="grid grid-cols-2 gap-3">
        <Field id={`${id}-label`} label={COPY.label} value={field.label} onChange={(label) => set({ label })} />
        <Field id={`${id}-label-zh`} label={COPY.labelZh} value={field.labelZh} placeholder={field.label} onChange={(labelZh) => set({ labelZh })} />
        <Field id={`${id}-placeholder`} label={COPY.placeholder} value={field.placeholder} onChange={(placeholder) => set({ placeholder })} />
        <Field id={`${id}-placeholder-zh`} label={COPY.placeholderZh} value={field.placeholderZh} placeholder={field.placeholder} onChange={(placeholderZh) => set({ placeholderZh })} />
        <Field id={`${id}-help`} label={COPY.help} value={field.help} onChange={(help) => set({ help })} />
        <Field id={`${id}-help-zh`} label={COPY.helpZh} value={field.helpZh} placeholder={field.help} onChange={(helpZh) => set({ helpZh })} />
        <Field id={`${id}-example`} label={COPY.example} value={field.example} onChange={(example) => set({ example })} />
        <Field id={`${id}-example-zh`} label={COPY.exampleZh} value={field.exampleZh} placeholder={field.example} onChange={(exampleZh) => set({ exampleZh })} />
      </div>
      {field.type === 'select' ? <OptionRows id={id} field={field} set={set} /> : null}
      <div className="grid gap-2">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={field.required} onCheckedChange={(checked) => set({ required: checked === true })} />
          {COPY.required}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={field.public} onCheckedChange={(checked) => set({ public: checked === true })} />
          {COPY.public}
        </label>
      </div>
    </div>
  )
}

// fields.copy + their Chinese text, edited as cards (ARCHITECTURE §5), in the order users see them.
export function TemplateCopyFields({ values, onChange }: Props) {
  const fields = values.copyFields
  const replace = (next: CopyFormValue[]) => onChange({ copyFields: next })
  const up = (at: number) => replace([...fields.slice(0, at - 1), ...fields.slice(at, at + 1), ...fields.slice(at - 1, at), ...fields.slice(at + 1)])
  return (
    <fieldset className="grid gap-3">
      <legend className="mb-1 text-sm font-semibold">{COPY.legend}</legend>
      <p className="text-muted-foreground text-xs">{COPY.hint}</p>
      {fields.length === 0 ? <p className="text-muted-foreground text-xs">{COPY.empty}</p> : null}
      <PromptSizeWarning body={values.promptBody} fields={fields} />
      {fields.map((field, index) => (
        <CopyCard key={index} index={index} field={field} body={values.promptBody}
          onChange={(next) => replace(fields.map((current, at) => (at === index ? next : current)))}
          onRemove={() => replace(fields.filter((_, at) => at !== index))}
          onUp={index > 0 ? () => up(index) : undefined} />
      ))}
      <Button variant="outline" size="sm" className="justify-self-start" disabled={fields.length >= COPY_FIELDS_MAX} onClick={() => replace([...fields, emptyCopyField()])}>
        {COPY.add}
      </Button>
    </fieldset>
  )
}

function PromptSizeWarning({ body, fields }: { body: string; fields: readonly CopyFormValue[] }) {
  const worst = worstPromptLength(body, fields)
  if (worst <= PROMPT_MAX_LENGTH) return null
  return <p role="status" className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-100">{COPY.promptSize(worst, PROMPT_MAX_LENGTH)}</p>
}
