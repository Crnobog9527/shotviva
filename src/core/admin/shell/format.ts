// Admin times are shown in Beijing time (the Owner's clock), fixed format, so the server render
// and the browser agree whatever the browser's zone.
const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000

export function toBeijingLocal(iso: string): string {
  return new Date(Date.parse(iso) + BEIJING_OFFSET_MS).toISOString().slice(0, 16)
}

export function formatBeijing(iso: string | null): string | null {
  return iso ? toBeijingLocal(iso).replace('T', ' ') : null
}

export function beijingLocalToIso(local: string): string | null {
  if (!local) return null
  const ms = Date.parse(`${local}:00Z`)
  return Number.isNaN(ms) ? null : new Date(ms - BEIJING_OFFSET_MS).toISOString()
}
