// The food templates' two toggle keys (ARCHITECTURE §5.1c). No imports: the root layout's client
// context reads them, so nothing heavier (zod) may come with them into every page.
export const PLATING_TOGGLE = 'plating'
export const TABLEWARE_TOGGLE = 'tableware'
// Both, for the site-wide switch (system_settings food_toggles_enabled): while it is off neither
// is offered and the server renders both off.
export const FOOD_TOGGLE_KEYS: readonly string[] = [PLATING_TOGGLE, TABLEWARE_TOGGLE]
