'use client'

import { useState } from 'react'

import { trackTemplateToggle } from '@/core/analytics/browser'
import type { EventProps } from '@/core/analytics/events'

import type { CatalogueToggle } from '../catalogue/catalogue-template'
import { rememberConfirmed, wasConfirmed, type ToggleValues } from './toggle-state'

export type ToggleSurface = EventProps<'template_toggle'>['surface']

type Args = {
  templateId: string
  toggles: readonly CatalogueToggle[]
  values: ToggleValues
  onChange(next: ToggleValues): void
  surface: ToggleSurface
}

// Turning a toggle on (T89): straight on when it has no dialog or the dialog was accepted earlier
// in this browser session for this template; otherwise the dialog opens and the toggle stays off
// until the user ticks the box and presses its accept button. Cancel or closing keeps it off.
export function useToggleConfirm({ templateId, toggles, values, onChange, surface }: Args) {
  const [asking, setAsking] = useState<CatalogueToggle | null>(null)
  const track = (key: string, action: EventProps<'template_toggle'>['action']) => trackTemplateToggle({ template_id: templateId, key, action, surface })
  const set = (key: string, on: boolean) => onChange({ ...values, [key]: on })

  const request = (key: string, on: boolean) => {
    const toggle = toggles.find((candidate) => candidate.key === key)
    if (!toggle) return
    if (!on) {
      set(key, false)
      if (toggle.confirm) track(key, 'turned_off')
      return
    }
    if (!toggle.confirm || wasConfirmed(templateId, key)) return set(key, true)
    setAsking(toggle)
    track(key, 'confirm_shown')
  }
  const accept = () => {
    if (!asking) return
    rememberConfirmed(templateId, asking.key)
    set(asking.key, true)
    track(asking.key, 'confirmed')
    setAsking(null)
  }
  const cancel = () => {
    if (!asking) return
    track(asking.key, 'cancelled')
    setAsking(null)
  }
  return { asking, request, accept, cancel }
}
