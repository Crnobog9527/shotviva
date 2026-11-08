'use client'

import type { CatalogueToggle } from '../catalogue/catalogue-template'
import { ToggleConfirmSheet } from './toggle-confirm-sheet'
import { ToggleRows } from './toggle-rows'
import type { ToggleValues } from './toggle-state'
import { useToggleConfirm, type ToggleSurface } from './use-toggle-confirm'

type Props = {
  template: { id: string; toggles: readonly CatalogueToggle[] } | null
  values: ToggleValues
  onChange(next: ToggleValues): void
  surface: ToggleSurface
  compact?: boolean
  // The wrapper's spacing; nothing is rendered, wrapper included, without toggles.
  className?: string
}

// A template's on/off options with their confirm dialog (T89): the workspace page, the creation
// dialog and the home generator all render this one. Nothing at all for a template without any.
const NONE: readonly CatalogueToggle[] = []

export function TemplateToggles({ template, values, onChange, surface, compact, className }: Props) {
  const toggles = template?.toggles ?? NONE
  const flow = useToggleConfirm({ templateId: template?.id ?? '', toggles, values, onChange, surface })
  if (toggles.length === 0) return null
  return (
    <div className={className}>
      <ToggleRows idPrefix={`toggle-${surface}`} toggles={toggles} values={values} onRequest={flow.request} compact={compact} />
      <ToggleConfirmSheet toggle={flow.asking} onAccept={flow.accept} onCancel={flow.cancel} />
    </div>
  )
}
