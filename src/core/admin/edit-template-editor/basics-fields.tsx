'use client'

import { Input } from '@/core/ui/input'
import { Label } from '@/core/ui/label'
import { Switch } from '@/core/ui/switch'
import { Textarea } from '@/core/ui/textarea'
import { RESOLUTIONS } from '@/core/templates/output-options'
import type { CreditsFloor } from '@/core/templates/pricing'

import { TIER_LABEL } from '../templates-editor/form-state'

import { EDIT_TEMPLATE_COPY as COPY } from './copy'
import type { EditTemplateForm } from './form-state'

type Props = {
  form: EditTemplateForm
  // The floor for the template's own quality tier.
  floor: CreditsFloor['high']
  version: number
  onChange: (patch: Partial<EditTemplateForm>) => void
}

export function BasicsFields({ form, floor, version, onChange }: Props) {
  return (
    <div className="grid gap-4 rounded-md border p-3">
      <div className="flex items-center gap-3">
        <Switch id="edit-active" checked={form.isActive} onCheckedChange={(isActive) => onChange({ isActive })} />
        <Label htmlFor="edit-active">{COPY.active}</Label>
        <span className="text-muted-foreground text-xs">{COPY.activeHint}</span>
      </div>
      <div className="grid gap-1.5">
        <span className="text-sm font-medium">{COPY.prices}</span>
        <div className="grid grid-cols-3 gap-3">
          {RESOLUTIONS.map((r) => (
            <div key={r} className="grid gap-1">
              <Label htmlFor={`edit-credits-${r}`}>{TIER_LABEL[r]}</Label>
              <Input id={`edit-credits-${r}`} inputMode="numeric" value={form.credits[r]}
                onChange={(event) => onChange({ credits: { ...form.credits, [r]: event.target.value } })} />
              <p className="text-muted-foreground text-xs">{COPY.floor(floor[r])}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="edit-wrapper">{`${COPY.wrapper} · ${COPY.version(version)}`}</Label>
        <Textarea id="edit-wrapper" className="min-h-28 font-mono text-xs" value={form.wrapper} onChange={(event) => onChange({ wrapper: event.target.value })} />
        <p className="text-muted-foreground text-xs">{COPY.wrapperHint}</p>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="edit-fidelity">{COPY.fidelity}</Label>
        <select id="edit-fidelity" className="border-input h-9 max-w-xs rounded-md border bg-transparent px-3 text-sm" value={form.inputFidelity}
          onChange={(event) => onChange({ inputFidelity: event.target.value as EditTemplateForm['inputFidelity'] })}>
          <option value="">{COPY.fidelityNone}</option>
          <option value="high">high</option>
          <option value="low">low</option>
        </select>
      </div>
    </div>
  )
}
