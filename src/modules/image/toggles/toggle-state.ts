import type { CatalogueToggle } from '../catalogue/catalogue-template'

// Template toggles in the browser (T89): what the request carries, and the per-session memory of
// a confirm dialog already accepted. Plain functions, testable without React.

export type ToggleValues = Record<string, boolean>

// /api/generate's inputs.toggles and inputs.toggles_confirmed: only the toggles that are on (off
// is the default), so a queued job or an open tab still goes through after an admin removes or
// renames a toggle the user never turned on. A toggle with a dialog can only be on here after the
// user accepted it (or Make again kept a work's confirmed choice), so every such toggle that is
// on goes out as confirmed; the server refuses one without it.
export function toggleRequest(toggles: readonly CatalogueToggle[], values: ToggleValues): { toggles?: ToggleValues; toggles_confirmed?: string[] } {
  const on = toggles.filter((toggle) => values[toggle.key] === true)
  if (on.length === 0) return {}
  const confirmed = on.filter((toggle) => toggle.confirm).map((toggle) => toggle.key)
  return { toggles: Object.fromEntries(on.map((toggle) => [toggle.key, true])), ...(confirmed.length > 0 ? { toggles_confirmed: confirmed } : {}) }
}

const storageKey = (templateId: string, key: string) => `shotviva:toggle-confirmed:${templateId}:${key}`

// "Once per template per browser session" (T89). Storage can be missing or throw (private
// windows, blocked site data): then the dialog simply shows again.
export function wasConfirmed(templateId: string, key: string): boolean {
  try {
    return window.sessionStorage.getItem(storageKey(templateId, key)) === '1'
  } catch {
    return false
  }
}

export function rememberConfirmed(templateId: string, key: string): void {
  try {
    window.sessionStorage.setItem(storageKey(templateId, key), '1')
  } catch {
    // Not remembered: the next turn-on asks again, which is the safe side.
  }
}
