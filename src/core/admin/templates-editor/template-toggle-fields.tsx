'use client'

import { Button } from '@/core/ui/button'
import { Checkbox } from '@/core/ui/checkbox'
import { Input } from '@/core/ui/input'
import { Label } from '@/core/ui/label'
import { Textarea } from '@/core/ui/textarea'
import { TOGGLES_MAX } from '@/core/templates/toggles'

import { TOGGLE_PRESETS, toggleCopy as COPY } from './copy'
import type { TemplateFormValues } from './form-state'
import { emptyToggle, type ConfirmText, type ToggleFormValue } from './toggle-form-state'

type Props = { values: TemplateFormValues; onChange: (patch: Partial<TemplateFormValues>) => void }

function Field({ id, label, value, onChange, long = false }: { id: string; label: string; value: string; onChange: (value: string) => void; long?: boolean }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {long ? (
        <Textarea id={id} rows={3} value={value} onChange={(event) => onChange(event.target.value)} />
      ) : (
        <Input id={id} value={value} onChange={(event) => onChange(event.target.value)} />
      )}
    </div>
  )
}

function ConfirmFields({ id, legend, text, onChange }: { id: string; legend: string; text: ConfirmText; onChange: (text: ConfirmText) => void }) {
  const set = (patch: Partial<ConfirmText>) => onChange({ ...text, ...patch })
  return (
    <fieldset className="grid gap-2 rounded-md border p-2">
      <legend className="px-1 text-xs font-medium">{legend}</legend>
      <Field id={`${id}-title`} label={COPY.title} value={text.title} onChange={(title) => set({ title })} />
      <Field id={`${id}-body`} label={COPY.body} value={text.body} onChange={(body) => set({ body })} long />
      <div className="grid grid-cols-2 gap-2">
        <Field id={`${id}-checkbox`} label={COPY.checkbox} value={text.checkbox} onChange={(checkbox) => set({ checkbox })} />
        <Field id={`${id}-accept`} label={COPY.accept} value={text.accept} onChange={(accept) => set({ accept })} />
      </div>
    </fieldset>
  )
}

function ToggleCard({ index, toggle, onChange, onRemove }: { index: number; toggle: ToggleFormValue; onChange: (next: ToggleFormValue) => void; onRemove: () => void }) {
  const id = `tpl-toggle-${index}`
  const set = (patch: Partial<ToggleFormValue>) => onChange({ ...toggle, ...patch })
  const key = toggle.key.trim() || 'key'
  return (
    <div className="grid gap-3 rounded-md border p-3">
      <div className="grid grid-cols-[1fr_auto] items-end gap-3">
        <Field id={`${id}-key`} label={COPY.key} value={toggle.key} onChange={(value) => set({ key: value })} />
        <Button variant="outline" size="sm" onClick={onRemove}>
          {COPY.remove}
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field id={`${id}-label`} label={COPY.label} value={toggle.label} onChange={(label) => set({ label })} />
        <Field id={`${id}-label-zh`} label={COPY.labelZh} value={toggle.labelZh} onChange={(labelZh) => set({ labelZh })} />
        <Field id={`${id}-hint`} label={COPY.hint_} value={toggle.hint} onChange={(hint) => set({ hint })} />
        <Field id={`${id}-hint-zh`} label={COPY.hintZh} value={toggle.hintZh} onChange={(hintZh) => set({ hintZh })} />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={toggle.confirm} onCheckedChange={(checked) => set({ confirm: checked === true })} />
        {COPY.confirm}
      </label>
      {toggle.confirm ? (
        <div className="grid gap-3 lg:grid-cols-2">
          <ConfirmFields id={`${id}-en`} legend={COPY.confirmEn} text={toggle.confirmEn} onChange={(confirmEn) => set({ confirmEn })} />
          <ConfirmFields id={`${id}-zh`} legend={COPY.confirmZh} text={toggle.confirmZh} onChange={(confirmZh) => set({ confirmZh })} />
        </div>
      ) : null}
      <div className="grid gap-3 rounded-md border border-dashed p-2 lg:grid-cols-2">
        <Field id={`${id}-on`} label={COPY.on.replace('key', key)} value={toggle.on} onChange={(on) => set({ on })} long />
        <Field id={`${id}-off`} label={COPY.off.replace('key', key)} value={toggle.off} onChange={(off) => set({ off })} long />
      </div>
    </div>
  )
}

// fields.toggles + their Chinese text + model_params.toggles (T89), edited as cards.
export function TemplateToggleFields({ values, onChange }: Props) {
  const { toggles } = values
  const replace = (next: ToggleFormValue[]) => onChange({ toggles: next })
  const full = toggles.length >= TOGGLES_MAX
  const has = (key: string) => toggles.some((toggle) => toggle.key.trim() === key)
  return (
    <fieldset className="grid gap-3">
      <legend className="mb-1 text-sm font-semibold">{COPY.legend}</legend>
      <p className="text-muted-foreground text-xs">{COPY.hint}</p>
      {toggles.map((toggle, index) => (
        <ToggleCard
          key={index}
          index={index}
          toggle={toggle}
          onChange={(next) => replace(toggles.map((current, at) => (at === index ? next : current)))}
          onRemove={() => replace(toggles.filter((_, at) => at !== index))}
        />
      ))}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" disabled={full} onClick={() => replace([...toggles, emptyToggle()])}>
          {COPY.add}
        </Button>
        {TOGGLE_PRESETS.map((preset) => (
          <Button key={preset.key} variant="outline" size="sm" disabled={full || has(preset.key)}
            onClick={() => replace([...toggles, { ...preset, confirmEn: { ...preset.confirmEn }, confirmZh: { ...preset.confirmZh } }])}>
            {COPY.addPreset(preset.labelZh)}
          </Button>
        ))}
      </div>
    </fieldset>
  )
}
