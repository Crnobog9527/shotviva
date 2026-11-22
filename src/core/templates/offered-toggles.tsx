'use client'

import { createContext, useContext, useMemo, type ReactNode } from 'react'

import { FOOD_TOGGLE_KEYS } from './food-toggle-keys'

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

export function useFoodTogglesEnabled(): boolean {
  return useContext(FoodTogglesContext)
}

export function useOfferedToggles<T extends { key: string }>(toggles: readonly T[]): readonly T[] {
  const enabled = useFoodTogglesEnabled()
  return useMemo(() => offeredToggles(toggles, enabled), [toggles, enabled])
}
