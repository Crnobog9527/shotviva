'use client'

import dynamic from 'next/dynamic'
import { useState } from 'react'

import type { CatalogueToggle } from '../catalogue/catalogue-template'
import { ToggleRows } from './toggle-rows'
import type { ToggleValues } from './toggle-state'
import { useToggleConfirm, type ToggleSurface } from './use-toggle-confirm'

// The confirm dialog carries the dialog / drawer code (radix, vaul) and the checkbox: it loads
// only once a row with a dialog is pointed at or focused, never in the first paint (the home
// page's JS budget). It renders nothing until then, which is what a closed one shows anyway.
const loadSheet = () => import('./toggle-confirm-sheet')
const ToggleConfirmSheet = dynamic(() => loadSheet().then((m) => m.ToggleConfirmSheet), { ssr: false })

type Props = {
  template: { id: string; toggles: readonly CatalogueToggle[] } | null
  values: ToggleValues
  onChange(next: ToggleValues): void
  surface: ToggleSurface
  compact?: boolean
  // The wrapper's spacing; nothing is rendered, wrapper included, without toggles.
  className?: string
}

const NONE: readonly CatalogueToggle[] = []

// A template's on/off options with their confirm dialog (T89): the workspace page, the creation
// dialog and the home generator all render this one. Nothing at all for a template without any.
export function TemplateToggles({ template, values, onChange, surface, compact, className }: Props) {
  const toggles = template?.toggles ?? NONE
  const flow = useToggleConfirm({ templateId: template?.id ?? '', toggles, values, onChange, surface })
  // Mounted from the first ask on, so the closing motion can still play after it.
  const [asked, setAsked] = useState(false)
  if (flow.asking && !asked) setAsked(true)
  if (toggles.length === 0) return null
  const prepare = toggles.some((toggle) => toggle.confirm) ? () => void loadSheet() : undefined
  return (
    <div className={className}>
      <ToggleRows toggles={toggles} values={values} onRequest={flow.request} onPrepare={prepare} compact={compact} />
      {asked ? <ToggleConfirmSheet toggle={flow.asking} onAccept={flow.accept} onCancel={flow.cancel} /> : null}
    </div>
  )
}
