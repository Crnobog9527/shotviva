'use client'

import { Switch } from '@/core/ui/switch'
import type { ToggleField } from '@/core/templates/toggles'

import { TEST_RUN_COPY as COPY } from './copy'

type Props = { toggles: readonly ToggleField[]; values: Record<string, boolean>; onChange: (next: Record<string, boolean>) => void }

// The template's toggles (T89) for a test run: an admin flips each one straight to on or off to
// try both prompt fragments; the user's confirm dialog is not shown here.
export function TestToggles({ toggles, values, onChange }: Props) {
  if (toggles.length === 0) return null
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-1 text-sm font-medium">{COPY.first.toggles}</legend>
      {toggles.map((toggle) => {
        const on = values[toggle.key] ?? false
        return (
          <label key={toggle.key} className="flex items-center justify-between gap-3 text-sm">
            <span>
              {toggle.label} <span className="text-muted-foreground font-mono text-xs">{toggle.key}</span>
            </span>
            <span className="flex items-center gap-2">
              <span className="text-muted-foreground text-xs">{on ? COPY.first.toggleOn : COPY.first.toggleOff}</span>
              <Switch checked={on} onCheckedChange={(checked) => onChange({ ...values, [toggle.key]: checked })} />
            </span>
          </label>
        )
      })}
    </fieldset>
  )
}
