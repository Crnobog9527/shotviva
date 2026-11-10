import type { AssetFilter, AssetPage, AssetUpdate, BatchInput, CategoryInput, ReferenceAsset } from './types'
import { copy } from './copy'

const root = '/api/admin/references'
async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', ...options })
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(typeof body?.message === 'string' ? body.message : copy.failed)
  }
  return response.json()
}
function write(url: string, method: string, payload: unknown) {
  return request<{ ok: true }>(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
}
export const listAssets = (filter: AssetFilter, cursor: string | null, signal?: AbortSignal) => {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries({ ...filter, cursor })) if (value) params.set(key, value)
  return request<AssetPage>(`${root}?${params}`, { signal })
}
export const getAsset = (id: string) => request<ReferenceAsset>(`${root}/${encodeURIComponent(id)}`)
export const updateAsset = (id: string, value: AssetUpdate) => write(`${root}/${encodeURIComponent(id)}`, 'PATCH', value)
export const batchAssets = (value: BatchInput) => write(`${root}/batch`, 'POST', value)
export const changeCategory = (value: CategoryInput) => write(`${root}/categories`, 'POST', value)
export const previewUrl = (id: string) => `/admin-media/references/${encodeURIComponent(id)}`

export function errorMessage(error: unknown) { return error instanceof Error ? error.message : copy.failed }
