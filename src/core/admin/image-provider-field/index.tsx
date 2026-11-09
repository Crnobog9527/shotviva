'use client'

import { Label } from '@/core/ui/label'

import { copy } from './copy'

export type ImageProviderOption = { id: string; label: string; model: string }

type Props = {
  id: string
  providers: readonly ImageProviderOption[]
  value: string | null
  onChange: (id: string | null) => void
}

export function ImageProviderField({ id, providers, value, onChange }: Props) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{copy.label}</Label>
      <select id={id} className="border-input h-9 min-w-0 rounded-md border bg-transparent px-3 text-sm"
        aria-describedby={`${id}-hint`} value={value ?? ''} onChange={(event) => onChange(event.target.value || null)}>
        <option value="">{copy.followDefault}</option>
        {providers.map((provider) => (
          <option key={provider.id} value={provider.id}>{provider.label} · {provider.model}</option>
        ))}
      </select>
      <p id={`${id}-hint`} className="text-muted-foreground text-xs">{copy.fallbackHint}</p>
    </div>
  )
}
