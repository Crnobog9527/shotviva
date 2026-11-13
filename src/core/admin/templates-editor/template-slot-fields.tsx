'use client'

import { Button } from '@/core/ui/button'
import { Checkbox } from '@/core/ui/checkbox'
import { Input } from '@/core/ui/input'
import { Label } from '@/core/ui/label'
import { IMAGE_SLOTS_MAX } from '@/core/templates/image-slots'

import { slotFieldCopy as COPY } from './copy'
import type { TemplateFormValues } from './form-state'
import { emptySlot, type SlotFormValue } from './slot-form-state'

type Props = { values: TemplateFormValues; onChange: (patch: Partial<TemplateFormValues>) => void }

function Field({ id, label, value, onChange, placeholder }: { id: string; label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </div>
  )
}

const usesPlaceholder = (body: string) => /\{\{\s*image_slots\s*\}\}/.test(body)

type CardProps = { index: number; slot: SlotFormValue; copyKeys: string[]; onChange: (next: SlotFormValue) => void; onRemove: () => void; onUp?: () => void }

function SlotCard({ index, slot, copyKeys, onChange, onRemove, onUp }: CardProps) {
  const id = `tpl-slot-${index}`
  const set = (patch: Partial<SlotFormValue>) => onChange({ ...slot, ...patch })
  return (
    <div className="grid gap-3 rounded-md border p-3">
      <div className="grid grid-cols-[1fr_auto_auto] items-end gap-2">
        <Field id={`${id}-key`} label={COPY.key} value={slot.key} onChange={(key) => set({ key })} />
        <Button variant="outline" size="sm" disabled={!onUp} onClick={onUp}>{COPY.up}</Button>
        <Button variant="outline" size="sm" onClick={onRemove}>{COPY.remove}</Button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field id={`${id}-label`} label={COPY.label} value={slot.label} onChange={(label) => set({ label })} />
        <Field id={`${id}-label-zh`} label={COPY.labelZh} value={slot.labelZh} placeholder={slot.label} onChange={(labelZh) => set({ labelZh })} />
        <Field id={`${id}-help`} label={COPY.help} value={slot.help} onChange={(help) => set({ help })} />
        <Field id={`${id}-help-zh`} label={COPY.helpZh} value={slot.helpZh} placeholder={slot.help} onChange={(helpZh) => set({ helpZh })} />
      </div>
      <div className="grid grid-cols-2 items-end gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-note`}>{COPY.note}</Label>
          <select id={`${id}-note`} className="border-input h-9 rounded-md border bg-transparent px-3 text-sm" value={slot.note}
            onChange={(event) => set({ note: event.target.value })}>
            <option value="">{COPY.noNote}</option>
            {copyKeys.map((key) => <option key={key} value={key}>{key}</option>)}
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={slot.required} onCheckedChange={(checked) => set({ required: checked === true })} />
          {COPY.required}
        </label>
      </div>
    </div>
  )
}

// fields.images.slots + their Chinese text, as cards in the order the model gets the images.
export function TemplateSlotFields({ values, onChange }: Props) {
  const slots = values.imageSlots
  const copyKeys = values.copyFields.map((field) => field.key.trim()).filter(Boolean)
  const replace = (next: SlotFormValue[]) => onChange({ imageSlots: next })
  const up = (at: number) => replace([...slots.slice(0, at - 1), ...slots.slice(at, at + 1), ...slots.slice(at - 1, at), ...slots.slice(at + 1)])
  return (
    <fieldset className="grid gap-3">
      <legend className="mb-1 text-sm font-semibold">{COPY.legend}</legend>
      <p className="text-muted-foreground text-xs">{COPY.hint}</p>
      {slots.length === 0 ? <p className="text-muted-foreground text-xs">{COPY.empty}</p> : <p className="text-muted-foreground text-xs">{COPY.placement(usesPlaceholder(values.promptBody))}</p>}
      {slots.map((slot, index) => (
        <SlotCard key={index} index={index} slot={slot} copyKeys={copyKeys}
          onChange={(next) => replace(slots.map((current, at) => (at === index ? next : current)))}
          onRemove={() => replace(slots.filter((_, at) => at !== index))}
          onUp={index > 0 ? () => up(index) : undefined} />
      ))}
      <Button variant="outline" size="sm" className="justify-self-start" disabled={slots.length >= IMAGE_SLOTS_MAX} onClick={() => replace([...slots, emptySlot()])}>
        {COPY.add}
      </Button>
    </fieldset>
  )
}
