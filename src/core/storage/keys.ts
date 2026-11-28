import { randomUUID } from 'node:crypto'

import type { UploadContentType } from './rules'

// Key layout (ARCHITECTURE §8.3, T4 card): everything a user owns sits under a prefix
// ending in their id, so account deletion can clear it by prefix (core/auth).
//   inputs/{user_id}/{uuid}.{ext}     compressed upload, 7-day bucket lifecycle
//   outputs/{user_id}/{job_id}.png    the single unwatermarked result, kept
//   outputs/{user_id}/{job_id}-input.webp
//                                     768px preview of the job's upload, kept with the result
//                                     (ARCHITECTURE §8 「原图小图」, T32)
//   outputs/{user_id}/{job_id}-thumb.webp | -thumb-p1.webp
//                                     the result's small copy for lists (ARCHITECTURE §8.3
//                                     「作品小图」): clean for a paid work; a free work's is the
//                                     protected copy (-p1, storage/protect, 2026-11-22). Free
//                                     works' older -thumb.webp (corner mark only) is never served
//                                     again, only deleted with the work
//   outputs/{user_id}/{job_id}-protected-p1.jpg
//                                     a free work's protected full copy, for links that must live
//                                     longer than a download (the partner API's 7-day URL)
//   outputs/{user_id}/{job_id}-in-{n}.{ext}
//                                     the job's own uploads (n from 1), copied at settle and
//                                     kept with the result for Make again (§8.3, T40)
//   inputs/{user_id}/downloads/{job_id}-white.jpg | -both.zip | -marked-p1.png |
//                             -marked-p1-white.jpg | -marked-p1-both.zip
//                                     a paid cut-out's 白底 copy and pair ZIP; a free cut-out's
//                                     protected 透明底 PNG, 白底 JPEG and pair ZIP; made on first
//                                     download and reused; 7-day lifecycle like every inputs/ key,
//                                     removed with the work too (with the pre-2026-11-22 -marked
//                                     names, which nothing serves any more)
//   outputs/{user_id}/store-qr-{uuid}.{ext}
//                                     the store profile's QR code (§5.3 店铺信息), a copy of the
//                                     user's upload; replaced on save, removed with the account
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
const STORE_QR_KEY = new RegExp(`^outputs/(${UUID})/store-qr-${UUID}\\.(jpg|png|webp)$`)
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

// Staged copies. White: a paid cut-out flattened onto white, unmarked. Both: a paid cut-out's
// 白底 + 透明 pair as one ZIP. Marked: a free cut-out's protected PNG with its alpha kept.
// Marked-white: a free cut-out's protected JPEG on white, staged only for the pair ZIP (the single
// 白底 download makes it per request). Marked-both: a free cut-out's pair ZIP. A paid 透明底
// download is the stored original itself. The -p1 names are the protected copies (2026-11-22); a
// change to what storage/protect draws bumps them, so an older copy is never handed out again.
const VARIANT_SUFFIX = {
  white: 'white.jpg',
  both: 'both.zip',
  marked: 'marked-p1.png',
  'marked-white': 'marked-p1-white.jpg',
  'marked-both': 'marked-p1-both.zip',
} as const
export type DownloadVariant = keyof typeof VARIANT_SUFFIX
export const DOWNLOAD_VARIANTS = Object.keys(VARIANT_SUFFIX) as DownloadVariant[]
// Names earlier versions staged; never served, only deleted with the work.
const RETIRED_VARIANT_SUFFIXES = ['marked.png', 'marked-white.jpg'] as const

export function downloadVariantKeyFor(userId: string, jobId: string, variant: DownloadVariant): string {
  return `inputs/${userId}/downloads/${jobId}-${VARIANT_SUFFIX[variant]}`
}

export function retiredVariantKeysFor(userId: string, jobId: string): string[] {
  return RETIRED_VARIANT_SUFFIXES.map((suffix) => `inputs/${userId}/downloads/${jobId}-${suffix}`)
}

export function inputPreviewKeyFor(userId: string, jobId: string): string {
  return `outputs/${userId}/${jobId}-input.webp`
}

// The list copy for a work of this pool: a free work's is the protected one.
export function workThumbKeyFor(userId: string, jobId: string, pool: 'free' | 'paid'): string {
  return pool === 'free' ? `outputs/${userId}/${jobId}-thumb-p1.webp` : `outputs/${userId}/${jobId}-thumb.webp`
}

// The smaller copy Photos' dense grid shows (ARCHITECTURE §8.3「作品小图」), kept like the list copy:
// a free work's is cut from its protected list copy, under its own key.
export function workTileKeyFor(userId: string, jobId: string, pool: 'free' | 'paid'): string {
  return pool === 'free' ? `outputs/${userId}/${jobId}-tile-p1.webp` : `outputs/${userId}/${jobId}-tile.webp`
}

// Every list and tile copy a work may have (current and retired), for deleting the work.
export function workThumbKeysFor(userId: string, jobId: string): string[] {
  const pools = ['paid', 'free'] as const
  return [...pools.map((pool) => workThumbKeyFor(userId, jobId, pool)), ...pools.map((pool) => workTileKeyFor(userId, jobId, pool))]
}

export function protectedCopyKeyFor(userId: string, jobId: string): string {
  return `outputs/${userId}/${jobId}-protected-p1.jpg`
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

// The store profile's QR code (§5.3 店铺信息): kept under outputs/, so no 7-day lifecycle.
export function newStoreQrKey(userId: string, contentType: UploadContentType): string {
  return `outputs/${userId}/store-qr-${randomUUID()}.${EXTENSION[contentType]}`
}

export function isStoreQrKey(userId: string, key: string): boolean {
  const match = STORE_QR_KEY.exec(key)
  return match !== null && match[1] === userId.toLowerCase()
}
