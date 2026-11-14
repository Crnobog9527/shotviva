import { randomUUID } from 'node:crypto'

import type { UploadContentType } from '@/core/storage/rules'

// Private-bucket layout of admin test runs (ARCHITECTURE §10.b, T85), apart from every user's
// prefix so account deletion and the users' lifecycle rules never touch it:
//   admin-tests/photos/{photo_id}.{ext}   a test photo, compressed by the browser like an upload
//   admin-tests/outputs/{run_id}.png      a test run's result
// Rows and objects are removed together by the panel's 30-day cleanup (0785).

const EXTENSION: Record<UploadContentType, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const PHOTO_KEY = new RegExp(`^admin-tests/photos/(${UUID})\\.(jpg|png|webp)$`)

export function newTestPhotoKey(contentType: UploadContentType): { photoId: string; key: string } {
  const photoId = randomUUID()
  return { photoId, key: `admin-tests/photos/${photoId}.${EXTENSION[contentType]}` }
}

// Keys come back from the browser, so the shape (and that it names this photo) is checked.
export function isTestPhotoKey(photoId: string, key: string): boolean {
  const match = PHOTO_KEY.exec(key)
  return match !== null && match[1] === photoId.toLowerCase()
}

export const testOutputKey = (runId: string) => `admin-tests/outputs/${runId}.png`
