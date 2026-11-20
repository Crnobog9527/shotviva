import type { MembershipTier } from '@/core/config'

import { canShareFile, mayShareFiles, type FileSharer } from '../result/share-mode'
import { zipRoute } from './zip-download'

// Saving a batch straight to a phone's photo library (instead of the ZIP): the route answers
// ?format=photos with one short-lived link per photo (same tier check, same limit, same files
// as the ZIP); the browser fetches them as Files and hands them to the OS share sheet, whose
// "Save N Images" / Gallery action puts them in the library.

// Ten files per share sheet keeps memory and the sheet itself manageable on a phone.
export const PHOTO_CHUNK = 10

export type PhotoLink = { url: string; name: string }

export type PhotoLinksOutcome =
  | { kind: 'ready'; photos: PhotoLink[] }
  | { kind: 'packing'; retryAfterMs: number }
  | { kind: 'limited'; retryAfterMs: number }
  | { kind: 'upgrade'; tier: MembershipTier }
  | { kind: 'error'; code: string }

const DEFAULT_WAIT_MS = 60_000

function retryAfter(response: Response): number {
  const seconds = Number(response.headers.get('Retry-After'))
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : DEFAULT_WAIT_MS
}

const isLink = (value: unknown): value is PhotoLink =>
  !!value && typeof (value as PhotoLink).url === 'string' && typeof (value as PhotoLink).name === 'string'

export async function readPhotoLinks(response: Response): Promise<PhotoLinksOutcome> {
  if (response.status === 202) return { kind: 'packing', retryAfterMs: retryAfter(response) }
  if (response.status === 429) return { kind: 'limited', retryAfterMs: retryAfter(response) }
  const body = (await response.json().catch(() => ({}))) as { photos?: unknown; code?: string; required_tier?: MembershipTier }
  if (response.ok && Array.isArray(body.photos) && body.photos.length && body.photos.every(isLink)) {
    return { kind: 'ready', photos: body.photos }
  }
  if (body.code === 'TIER_REQUIRED') return { kind: 'upgrade', tier: body.required_tier ?? 'pro' }
  return { kind: 'error', code: body.code ?? 'INTERNAL' }
}

export async function requestPhotoLinks(batchId: string, fetcher: typeof fetch = fetch): Promise<PhotoLinksOutcome> {
  try {
    const response = await fetcher(`${zipRoute(batchId)}?format=photos`, { headers: { Accept: 'application/json' }, cache: 'no-store' })
    return await readPhotoLinks(response)
  } catch {
    return { kind: 'error', code: 'NETWORK' }
  }
}

// Phones only: a touch screen as the main pointer and a browser that can share files. Desktops
// (and in-app browsers without file sharing) keep the ZIP.
export function phoneSaveSupported(coarsePointer: boolean, sharer: FileSharer | undefined): boolean {
  return coarsePointer && mayShareFiles(sharer)
}

export const nextChunk = (photos: PhotoLink[], saved: number, size = PHOTO_CHUNK): PhotoLink[] =>
  photos.slice(saved, saved + size)

const TYPE_BY_EXTENSION: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg' }

// The File keeps the bytes exactly as stored (same resolution and cleanliness as the ZIP entry).
function fileFrom(blob: Blob, name: string): File {
  const type = blob.type || TYPE_BY_EXTENSION[name.split('.').pop()?.toLowerCase() ?? ''] || 'image/png'
  return new File([blob], name, { type })
}

// Blobs, not <img>: the share sheet needs the bytes. no-store so a cached copy made without
// CORS headers is not reused. Null if any photo fails: a half chunk would count wrongly.
export async function fetchChunk(links: PhotoLink[], fetcher: typeof fetch = fetch): Promise<File[] | null> {
  try {
    return await Promise.all(links.map(async (link) => {
      const response = await fetcher(link.url, { cache: 'no-store' })
      if (!response.ok) throw new Error('fetch failed')
      return fileFrom(await response.blob(), link.name)
    }))
  } catch {
    return null
  }
}

// Asked with the real files: platforms answer per type, size and count.
export function canShareChunk(sharer: FileSharer | undefined, files: File[]): boolean {
  if (!mayShareFiles(sharer) || !files.length) return false
  try {
    return sharer.canShare({ files })
  } catch {
    return files.length === 1 && canShareFile(sharer, files[0])
  }
}

export type ShareResult = 'shared' | 'cancelled' | 'failed'

// Called inside the tap, before any await: iOS rejects a share started after one. Closing the
// sheet is AbortError and is not an error; resolving only means the sheet finished, since the
// OS does not say which action the user chose.
export async function shareChunk(sharer: Pick<Navigator, 'share'>, files: File[]): Promise<ShareResult> {
  try {
    await sharer.share({ files })
    return 'shared'
  } catch (error) {
    return error instanceof Error && error.name === 'AbortError' ? 'cancelled' : 'failed'
  }
}
