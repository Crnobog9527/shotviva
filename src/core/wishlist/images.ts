import 'server-only'

import { AppError } from '../errors'
import { logger } from '../logger'
import { isOwnInputKey, loadInputImage, newRequestImageKey, type ObjectStore } from '../storage'

// Long enough for a wall visit, short enough that a copied link soon stops working.
const IMAGE_URL_TTL_SECONDS = 60 * 60

// Reference images live in the private bucket; whoever may read the row (RLS, or the admin)
// gets short-lived GET links, never the keys.
export function signImages(store: ObjectStore, keys: readonly string[]): Promise<string[]> {
  return Promise.all(keys.map((key) => store.presignGet(key, { expiresInSeconds: IMAGE_URL_TTL_SECONDS })))
}

// Turns the caller's uploads into reference images. Other users see these on the wall, so
// each one goes through the same checks and re-encode as a generation input (size, type,
// magic number, decode; EXIF and GPS dropped, even for the uncompressed fallback upload) and
// lands as a JPEG under requests/{user_id}/ (ARCHITECTURE §15.1). The inputs/ originals are
// left to their 7-day lifecycle.
export async function storeRequestImages(store: ObjectStore, userId: string, inputKeys: readonly string[]): Promise<string[]> {
  if (new Set(inputKeys).size !== inputKeys.length || !inputKeys.every((key) => isOwnInputKey(userId, key))) {
    throw new AppError('INVALID_INPUT', 'Upload not found; please choose the photo again')
  }
  const written: string[] = []
  try {
    for (const inputKey of inputKeys) {
      const image = await loadInputImage(store, inputKey)
      const key = newRequestImageKey(userId)
      await store.put(key, image.bytes, image.contentType)
      written.push(key)
    }
    return written
  } catch (error) {
    await deleteImagesQuietly(store, written)
    throw error
  }
}

// Used on reject / take-down and to undo a post that failed after its images were written.
// Deleting a missing object is a no-op in R2, so a retry is always safe.
export async function deleteImages(store: ObjectStore, keys: readonly string[]): Promise<void> {
  for (const key of keys) await store.delete(key)
}

export async function deleteImagesQuietly(store: ObjectStore, keys: readonly string[]): Promise<void> {
  await deleteImages(store, keys).catch((error: unknown) => logger.warn('wishlist images not deleted', { keys, error }))
}
