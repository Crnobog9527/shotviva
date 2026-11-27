// The food templates' two toggle keys (ARCHITECTURE §5.1c). No imports: the root layout's client
// context reads them, so nothing heavier (zod) may come with them into every page.
export const PLATING_TOGGLE = 'plating'
export const TABLEWARE_TOGGLE = 'tableware'
export const FOOD_TOGGLE_KEYS: readonly string[] = [PLATING_TOGGLE, TABLEWARE_TOGGLE]
// The optional copy field a food template asks the dish's name in (Owner 2026-11-15). Only the
// toggle flows' dish reader reads it, so while both switches are off it is hidden and dropped too.
export const DISH_NAME_COPY = 'dish_name'
export const FOOD_COPY_KEYS: readonly string[] = [DISH_NAME_COPY]

// The site-wide switches, one per toggle (system_settings food_plating_enabled and
// food_tableware_enabled, 2009). A toggle whose switch is off is neither offered nor honoured: the
// server renders it off whatever the request says.
export type FoodSwitches = { readonly plating: boolean; readonly tableware: boolean }
export const FOOD_SWITCHES_OFF: FoodSwitches = { plating: false, tableware: false }

// The toggle keys whose switch is off.
export function switchedOffToggles(switches: FoodSwitches): readonly string[] {
  if (switches.plating && switches.tableware) return []
  return FOOD_TOGGLE_KEYS.filter((key) => (key === PLATING_TOGGLE ? !switches.plating : !switches.tableware))
}

// Both flows read the dish (the reading picks the plating and the library vessel's category), so
// the dish name is offered while either switch is on.
export const dishNameOffered = (switches: FoodSwitches): boolean => switches.plating || switches.tableware

// What validateGenerationInputs must force: the switched-off toggles rendered off, and the dish name
// left out once neither flow can run.
export function foodSwitchedOff(switches: FoodSwitches): { forceOff: readonly string[]; dropCopy: readonly string[] } {
  return { forceOff: switchedOffToggles(switches), dropCopy: dishNameOffered(switches) ? [] : FOOD_COPY_KEYS }
}
