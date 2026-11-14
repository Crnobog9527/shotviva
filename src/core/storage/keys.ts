import { randomUUID } from 'node:crypto'

import type { UploadContentType } from './rules'

// Key layout (ARCHITECTURE §8.3, T4 card): everything a user owns sits under a prefix
// ending in their id, so account deletion can clear it by prefix (core/auth).
//   inputs/{user_id}/{uuid}.{ext}     compressed upload, 7-day bucket lifecycle
//   outputs/{user_id}/{job_id}.png    the single unwatermarked result, kept
//   outputs/{user_id}/{job_id}-input.webp
//                                     768px preview of the job's upload, kept with the result
//                                     (ARCHITECTURE §8 「原图小图」, T32)
//   outputs/{user_id}/{job_id}-thumb.webp
//                                     the result's small copy for lists, watermarked when the
//                                     work is (ARCHITECTURE §8.3「作品小图」)
//   outputs/{user_id}/{job_id}-in-{n}.{ext}
//                                     the job's own uploads (n from 1), copied at settle and
//                                     kept with the result for Make again (§8.3, T40)
//   inputs/{user_id}/downloads/{job_id}-white.jpg | -marked.png | -marked-white.jpg | -both.zip
//                                     a cut-out's 白底 copy, a free cut-out's watermarked 透明底
//                                     PNG or 白底 JPEG, or the 白底 + 透明 pair as one ZIP, made on
//                                     first download and reused; 7-day lifecycle like every
//                                     inputs/ key, removed with the work too
//   requests/{user_id}/{uuid}.jpg     wishlist reference image, re-encoded; kept until the
//                                     request is rejected or taken down (ARCHITECTURE §15.1)
//   tickets/{user_id}/{ticket_id}/{uuid}.webp
//                                     a support-ticket image, re-encoded by the server (EXIF
//                                     gone); user_id is the ticket's author, also for the Owner's
//                                     images; kept with the ticket (ARCHITECTURE §10, T69)

const EXTENSION: Record<UploadContentType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

const CONTENT_TYPE: Record<string, UploadContentType> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const INPUT_KEY = new RegExp(`^inputs/(${UUID})/${UUID}\\.(jpg|png|webp)$`)
const KEPT_KEY = new RegExp(`^outputs/(${UUID})/(${UUID})-in-[1-9][0-9]?\\.(jpg|png|webp)$`)

export function newInputKey(userId: string, contentType: UploadContentType): string {
  return `inputs/${userId}/${randomUUID()}.${EXTENSION[contentType]}`
}

export function newRequestImageKey(userId: string): string {
  return `requests/${userId}/${randomUUID()}.jpg`
}

export function newTicketImageKey(ticketAuthorId: string, ticketId: string): string {
  return `tickets/${ticketAuthorId}/${ticketId}/${randomUUID()}.webp`
}

export function outputKeyFor(userId: string, jobId: string): string {
  return `outputs/${userId}/${jobId}.png`
}

// Staged copies. White: a paid cut-out flattened onto white, unmarked. Marked: a free cut-out's
// watermarked PNG with its alpha kept. Marked-white: a free cut-out's marked JPEG on white, staged
// only for the pair ZIP (the single 白底 download makes it per request). Both: the 白底 + 透明 pair
// as one ZIP. A paid 透明底 download is the stored original itself.
const VARIANT_SUFFIX = { white: 'white.jpg', marked: 'marked.png', 'marked-white': 'marked-white.jpg', both: 'both.zip' } as const
export type DownloadVariant = keyof typeof VARIANT_SUFFIX
export const DOWNLOAD_VARIANTS = Object.keys(VARIANT_SUFFIX) as DownloadVariant[]

export function downloadVariantKeyFor(userId: string, jobId: string, variant: DownloadVariant): string {
  return `inputs/${userId}/downloads/${jobId}-${VARIANT_SUFFIX[variant]}`
}

export function inputPreviewKeyFor(userId: string, jobId: string): string {
  return `outputs/${userId}/${jobId}-input.webp`
}

export function workThumbKeyFor(userId: string, jobId: string): string {
  return `outputs/${userId}/${jobId}-thumb.webp`
}

// The upload's own extension is kept: normal uploads are JPEG (the browser compresses), the
// rare uncompressed fallback stays PNG or WebP, and a copy never changes the bytes.
export function keptInputKeyFor(userId: string, jobId: string, n: number, inputKey: string): string {
  return `outputs/${userId}/${jobId}-in-${n}.${inputKey.slice(inputKey.lastIndexOf('.') + 1)}`
}

// A kept input belongs to exactly one user's job; the shape is checked before any copy back.
export function isKeptInputKey(userId: string, jobId: string, key: string): boolean {
  const match = KEPT_KEY.exec(key)
  return match !== null && match[1] === userId.toLowerCase() && match[2] === jobId.toLowerCase()
}

// Content type from a key's extension (jpg / png / webp), for a fresh inputs/ key.
export function contentTypeOfKey(key: string): UploadContentType | null {
  return CONTENT_TYPE[key.slice(key.lastIndexOf('.') + 1)] ?? null
}

// Keys come back from the browser, so ownership is checked by shape, never trusted.
export function isOwnInputKey(userId: string, key: string): boolean {
  const match = INPUT_KEY.exec(key)
  return match !== null && match[1] === userId.toLowerCase()
}
