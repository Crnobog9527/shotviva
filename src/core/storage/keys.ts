import { randomUUID } from 'node:crypto'

import type { UploadContentType } from './rules'

// Key layout (ARCHITECTURE §8.3, T4 card): everything a user owns sits under a prefix
// ending in their id, so account deletion can clear it by prefix (core/auth).
//   inputs/{user_id}/{uuid}.{ext}     compressed upload, 7-day bucket lifecycle
//   outputs/{user_id}/{job_id}.png    the single unwatermarked result, kept
//   outputs/{user_id}/{job_id}-input.webp
//                                     768px preview of the job's upload, kept with the result
//                                     (ARCHITECTURE §8 「原图小图」, T32)
//   requests/{user_id}/{uuid}.jpg     wishlist reference image, re-encoded; kept until the
//                                     request is rejected or taken down (ARCHITECTURE §15.1)

const EXTENSION: Record<UploadContentType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const INPUT_KEY = new RegExp(`^inputs/(${UUID})/${UUID}\\.(jpg|png|webp)$`)

export function newInputKey(userId: string, contentType: UploadContentType): string {
  return `inputs/${userId}/${randomUUID()}.${EXTENSION[contentType]}`
}

export function newRequestImageKey(userId: string): string {
  return `requests/${userId}/${randomUUID()}.jpg`
}

export function outputKeyFor(userId: string, jobId: string): string {
  return `outputs/${userId}/${jobId}.png`
}

export function inputPreviewKeyFor(userId: string, jobId: string): string {
  return `outputs/${userId}/${jobId}-input.webp`
}

// Keys come back from the browser, so ownership is checked by shape, never trusted.
export function isOwnInputKey(userId: string, key: string): boolean {
  const match = INPUT_KEY.exec(key)
  return match !== null && match[1] === userId.toLowerCase()
}
