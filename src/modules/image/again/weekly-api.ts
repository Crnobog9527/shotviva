import type { StoreQr } from '@/core/store-profile'

import type { LastIssue } from './load-last'
import type { WeeklyPeek } from './weekly'

// The editors' calls to /api/weekly/<templateId> (§5.3「每周复用」). Any failure reads as
// "nothing to offer": weekly reuse is a shortcut, never in the way of making the poster.

const path = (templateId: string) => `/api/weekly/${encodeURIComponent(templateId)}`

export async function fetchWeeklyPeek(templateId: string, also: readonly string[], signal?: AbortSignal): Promise<WeeklyPeek | null> {
  try {
    const query = also.length ? `?also=${encodeURIComponent(also.join(','))}` : ''
    const response = await fetch(`${path(templateId)}${query}`, { signal })
    return response.ok ? ((await response.json()) as WeeklyPeek) : null
  } catch {
    return null
  }
}

async function act<T>(templateId: string, body: unknown): Promise<T | null> {
  try {
    const response = await fetch(path(templateId), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    return response.ok ? ((await response.json()) as T | null) : null
  } catch {
    return null
  }
}

export const fetchLastIssue = (templateId: string, also: readonly string[]) => act<LastIssue>(templateId, { want: 'last', also })
export const fetchStoreQr = (templateId: string) => act<StoreQr>(templateId, { want: 'store_qr' })
export const turnAutofillOff = (templateId: string) => act<{ ok: true }>(templateId, { want: 'autofill_off' })
