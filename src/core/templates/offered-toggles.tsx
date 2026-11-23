'use client'

import { createContext, useContext, useMemo, type ReactNode } from 'react'

import { FOOD_COPY_KEYS, FOOD_TOGGLE_KEYS } from './food-toggle-keys'

// The site-wide switch for 优化摆盘 / 优化器皿 (system_settings food_toggles_enabled), handed to
// the browser by the root layout. Without a provider it reads off, the safe side.
const FoodTogglesContext = createContext(false)

export function FoodTogglesProvider({ enabled, children }: { enabled: boolean; children?: ReactNode }) {
  return <FoodTogglesContext.Provider value={enabled}>{children}</FoodTogglesContext.Provider>
}

// A template's toggles as offered now: without the food ones while the switch is off. The
// template's own data keeps them, so turning the switch on brings them back unchanged.
export function offeredToggles<T extends { key: string }>(toggles: readonly T[], foodEnabled: boolean): readonly T[] {
  return foodEnabled ? toggles : toggles.filter((toggle) => !FOOD_TOGGLE_KEYS.includes(toggle.key))
}

// A template's copy fields as offered now: without the dish name while the switch is off (only the
// toggle flows read it). The same array when nothing is hidden.
export function offeredCopyFields<F extends { key: string }>(fields: readonly F[], foodEnabled: boolean): F[] {
  const hidden = (field: F) => FOOD_COPY_KEYS.includes(field.key)
  return foodEnabled || !fields.some(hidden) ? (fields as F[]) : fields.filter((field) => !hidden(field))
}

// A browser template (CatalogueTemplate) with offeredCopyFields applied; the same object when
// nothing is hidden, so identity checks and memos downstream keep working.
export function offeredTemplate<T extends { copyFields: { key: string }[] }>(template: T, foodEnabled: boolean): T {
  const copyFields = offeredCopyFields(template.copyFields ?? [], foodEnabled)
  return copyFields === template.copyFields || copyFields.length === (template.copyFields ?? []).length ? template : { ...template, copyFields }
}

export function useFoodTogglesEnabled(): boolean {
  return useContext(FoodTogglesContext)
}

export function useOfferedToggles<T extends { key: string }>(toggles: readonly T[]): readonly T[] {
  const enabled = useFoodTogglesEnabled()
  return useMemo(() => offeredToggles(toggles, enabled), [toggles, enabled])
}

export function useOfferedCopyFields<F extends { key: string }>(fields: readonly F[]): F[] {
  const enabled = useFoodTogglesEnabled()
  return useMemo(() => offeredCopyFields(fields, enabled), [fields, enabled])
}

export function useOfferedTemplate<T extends { copyFields: { key: string }[] }>(template: T): T {
  const enabled = useFoodTogglesEnabled()
  return useMemo(() => offeredTemplate(template, enabled), [template, enabled])
}
