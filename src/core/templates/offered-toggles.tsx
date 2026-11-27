'use client'

import { createContext, useContext, useMemo, type ReactNode } from 'react'

import { FOOD_COPY_KEYS, FOOD_TOGGLE_KEYS } from './food-toggle-keys'

// What the site-wide switches for 优化摆盘 and 优化器皿 (system_settings food_plating_enabled,
// food_tableware_enabled) hide, worked out on the server (foodSwitchedOff) and handed to the browser
// by the root layout, so no switch logic ships in every page. Without a provider everything food
// is hidden, the safe side.
export type FoodOffer = { readonly forceOff: readonly string[]; readonly dropCopy: readonly string[] }
const ALL_OFF: FoodOffer = { forceOff: FOOD_TOGGLE_KEYS, dropCopy: FOOD_COPY_KEYS }
const FoodTogglesContext = createContext<FoodOffer>(ALL_OFF)

export function FoodTogglesProvider({ offer, children }: { offer: FoodOffer; children?: ReactNode }) {
  return <FoodTogglesContext.Provider value={offer}>{children}</FoodTogglesContext.Provider>
}

// A template's toggles as offered now: without each food toggle whose switch is off. The template's
// own data keeps them, so turning a switch on brings that toggle back unchanged.
export function offeredToggles<T extends { key: string }>(toggles: readonly T[], offer: FoodOffer): readonly T[] {
  const off = offer.forceOff
  return off.length === 0 ? toggles : toggles.filter((toggle) => !off.includes(toggle.key))
}

// A template's copy fields as offered now: without the dish name while both switches are off (only
// the toggle flows read it). The same array when nothing is hidden.
export function offeredCopyFields<F extends { key: string }>(fields: readonly F[], offer: FoodOffer): F[] {
  const hidden = (field: F) => offer.dropCopy.includes(field.key)
  return !fields.some(hidden) ? (fields as F[]) : fields.filter((field) => !hidden(field))
}

// A browser template (CatalogueTemplate) with offeredCopyFields applied; the same object when
// nothing is hidden, so identity checks and memos downstream keep working.
export function offeredTemplate<T extends { copyFields: { key: string }[] }>(template: T, offer: FoodOffer): T {
  const copyFields = offeredCopyFields(template.copyFields ?? [], offer)
  return copyFields === template.copyFields || copyFields.length === (template.copyFields ?? []).length ? template : { ...template, copyFields }
}

export function useFoodOffer(): FoodOffer {
  return useContext(FoodTogglesContext)
}

export function useOfferedToggles<T extends { key: string }>(toggles: readonly T[]): readonly T[] {
  const offer = useFoodOffer()
  return useMemo(() => offeredToggles(toggles, offer), [toggles, offer])
}

export function useOfferedCopyFields<F extends { key: string }>(fields: readonly F[]): F[] {
  const offer = useFoodOffer()
  return useMemo(() => offeredCopyFields(fields, offer), [fields, offer])
}

export function useOfferedTemplate<T extends { copyFields: { key: string }[] }>(template: T): T {
  const offer = useFoodOffer()
  return useMemo(() => offeredTemplate(template, offer), [template, offer])
}
