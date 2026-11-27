'use client'

import { createContext, useContext, useMemo, type ReactNode } from 'react'

import { dishNameOffered, FOOD_COPY_KEYS, FOOD_SWITCHES_OFF, switchedOffToggles, type FoodSwitches } from './food-toggle-keys'

// The site-wide switches for 优化摆盘 and 优化器皿 (system_settings food_plating_enabled,
// food_tableware_enabled), handed to the browser by the root layout. Without a provider both read
// off, the safe side.
const FoodTogglesContext = createContext<FoodSwitches>(FOOD_SWITCHES_OFF)

export function FoodTogglesProvider({ switches, children }: { switches: FoodSwitches; children?: ReactNode }) {
  return <FoodTogglesContext.Provider value={switches}>{children}</FoodTogglesContext.Provider>
}

// A template's toggles as offered now: without each food toggle whose switch is off. The template's
// own data keeps them, so turning a switch on brings that toggle back unchanged.
export function offeredToggles<T extends { key: string }>(toggles: readonly T[], switches: FoodSwitches): readonly T[] {
  const off = switchedOffToggles(switches)
  return off.length === 0 ? toggles : toggles.filter((toggle) => !off.includes(toggle.key))
}

// A template's copy fields as offered now: without the dish name while both switches are off (only
// the toggle flows read it). The same array when nothing is hidden.
export function offeredCopyFields<F extends { key: string }>(fields: readonly F[], switches: FoodSwitches): F[] {
  const hidden = (field: F) => FOOD_COPY_KEYS.includes(field.key)
  return dishNameOffered(switches) || !fields.some(hidden) ? (fields as F[]) : fields.filter((field) => !hidden(field))
}

// A browser template (CatalogueTemplate) with offeredCopyFields applied; the same object when
// nothing is hidden, so identity checks and memos downstream keep working.
export function offeredTemplate<T extends { copyFields: { key: string }[] }>(template: T, switches: FoodSwitches): T {
  const copyFields = offeredCopyFields(template.copyFields ?? [], switches)
  return copyFields === template.copyFields || copyFields.length === (template.copyFields ?? []).length ? template : { ...template, copyFields }
}

export function useFoodSwitches(): FoodSwitches {
  return useContext(FoodTogglesContext)
}

export function useOfferedToggles<T extends { key: string }>(toggles: readonly T[]): readonly T[] {
  const switches = useFoodSwitches()
  return useMemo(() => offeredToggles(toggles, switches), [toggles, switches])
}

export function useOfferedCopyFields<F extends { key: string }>(fields: readonly F[]): F[] {
  const switches = useFoodSwitches()
  return useMemo(() => offeredCopyFields(fields, switches), [fields, switches])
}

export function useOfferedTemplate<T extends { copyFields: { key: string }[] }>(template: T): T {
  const switches = useFoodSwitches()
  return useMemo(() => offeredTemplate(template, switches), [template, switches])
}
