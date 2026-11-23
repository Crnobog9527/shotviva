// The food templates' two toggle keys (ARCHITECTURE §5.1c). No imports: the root layout's client
// context reads them, so nothing heavier (zod) may come with them into every page.
export const PLATING_TOGGLE = 'plating'
export const TABLEWARE_TOGGLE = 'tableware'
// Both, for the site-wide switch (system_settings food_toggles_enabled): while it is off neither
// is offered and the server renders both off.
export const FOOD_TOGGLE_KEYS: readonly string[] = [PLATING_TOGGLE, TABLEWARE_TOGGLE]
// The optional copy field a food template asks the dish's name in (Owner 2026-11-15). Only the
// toggle flows' dish reader reads it, so while the switch is off it is hidden and dropped too.
export const DISH_NAME_COPY = 'dish_name'
export const FOOD_COPY_KEYS: readonly string[] = [DISH_NAME_COPY]
