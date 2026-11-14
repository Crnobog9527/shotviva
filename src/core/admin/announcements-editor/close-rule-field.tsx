'use client'

import { ANNOUNCEMENTS_COPY } from './copy'
import { RESHOW_PRESETS } from './form-state'

const COPY = ANNOUNCEMENTS_COPY.form

type Props = { value: string; onChange: (value: string) => void }

// What happens after a visitor closes the banner (ARCHITECTURE §10「关闭规则」). A stored day
// count outside the presets still shows as itself.
export function CloseRuleField({ value, onChange }: Props) {
  const days = RESHOW_PRESETS.map(String)
  const custom = value !== 'changed' && value !== 'never' && !days.includes(value) ? [value] : []
  return (
    <label className="grid gap-1 text-sm md:col-span-2">
      <span className="font-medium">{COPY.close}</span>
      <select
        className="h-9 rounded-md border border-input bg-transparent px-3"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {[...days, ...custom].map((day) => (
          <option key={day} value={day}>
            {COPY.closeOptions.days(Number(day))}
          </option>
        ))}
        <option value="changed">{COPY.closeOptions.changed}</option>
        <option value="never">{COPY.closeOptions.never}</option>
      </select>
      <span className="text-xs text-muted-foreground">{COPY.closeHint}</span>
    </label>
  )
}
