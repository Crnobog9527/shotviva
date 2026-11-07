import 'server-only'

import sharp from 'sharp'

import { AppError } from '../errors'
import { logger } from '../logger'
import { isOwnInputKey, newTicketImageKey, sniffImageType, type ObjectStore } from '../storage'
import { INPUT_LONG_EDGE, isUploadContentType } from '../storage/rules'
import { TICKET_IMAGE_MAX_BYTES, TICKET_IMAGES_MAX } from './rules'
import { ticketIdSchema } from './schema'
import type { ShownMessage, TicketMessage } from './types'

// Ticket images (ARCHITECTURE §10 「可以附图片」, T69). The browser PUTs each picked image to its
// own inputs/ key (the generation upload, /api/uploads); on send the server takes them from
// there, checks size, type and the bytes themselves, re-encodes to WebP (EXIF and GPS gone,
// orientation baked in) under tickets/<author>/<ticket>/, and deletes the upload. The SQL
// function then records them with the message in one transaction.

// What create_support_ticket / add_ticket_message / admin_reply_ticket take as p_images.
export type TicketImageRow = { object_key: string; content_type: 'image/webp'; bytes: number; width: number; height: number }

// Who uploaded (the inputs/ prefix the keys must be under) and where the files go: the ticket's
// author and the ticket. For the Owner's replies the uploader is the admin, the author the user.
export type ImageTarget = { uploaderId: string; authorId: string; ticketId: string }

const MAX_PIXELS = 120_000_000
const WEBP_QUALITY = 82
// Long enough to read a phone screenshot, short enough for the thread.
const SIGNED_URL_SECONDS = 15 * 60

function refused(code: 'IMAGE_TOO_LARGE' | 'IMAGE_UNSUPPORTED' | 'INVALID_INPUT'): AppError {
  return new AppError(code, code === 'IMAGE_TOO_LARGE' ? 'Image is larger than 10MB' : 'Please use a JPEG, PNG or WebP image')
}

async function readUpload(store: ObjectStore, key: string): Promise<Uint8Array> {
  const head = await store.head(key)
  if (!head) throw refused('INVALID_INPUT')
  if (head.size > TICKET_IMAGE_MAX_BYTES) throw refused('IMAGE_TOO_LARGE')
  if (!head.contentType || !isUploadContentType(head.contentType)) throw refused('IMAGE_UNSUPPORTED')
  const bytes = await store.get(key)
  if (bytes.length > TICKET_IMAGE_MAX_BYTES) throw refused('IMAGE_TOO_LARGE')
  const sniffed = sniffImageType(bytes)
  if (!sniffed || !isUploadContentType(sniffed)) throw refused('IMAGE_UNSUPPORTED')
  return bytes
}

// sharp drops all metadata unless asked to keep it; rotate() first applies the EXIF orientation.
export async function toTicketWebp(bytes: Uint8Array): Promise<{ data: Uint8Array; width: number; height: number }> {
  try {
    const { data, info } = await sharp(bytes, { limitInputPixels: MAX_PIXELS })
      .rotate()
      .resize({ width: INPUT_LONG_EDGE, height: INPUT_LONG_EDGE, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer({ resolveWithObject: true })
    return { data: new Uint8Array(data), width: info.width, height: info.height }
  } catch {
    throw refused('IMAGE_UNSUPPORTED')
  }
}

async function storeOne(store: ObjectStore, target: ImageTarget, inputKey: string): Promise<TicketImageRow> {
  let webp: Awaited<ReturnType<typeof toTicketWebp>>
  try {
    webp = await toTicketWebp(await readUpload(store, inputKey))
  } catch (error) {
    // A refused upload goes at once (as in core/storage loadInputImage); a missing one is gone.
    if (error instanceof AppError && error.code !== 'INVALID_INPUT') await quietlyDelete(store, [inputKey])
    throw error
  }
  const key = newTicketImageKey(target.authorId, target.ticketId)
  await store.put(key, webp.data, 'image/webp')
  return { object_key: key, content_type: 'image/webp', bytes: webp.data.length, width: webp.width, height: webp.height }
}

async function quietlyDelete(store: ObjectStore, keys: readonly string[]) {
  await Promise.all(keys.map((key) => store.delete(key).catch((error: unknown) => logger.warn('support.image.delete_failed', { key, error }))))
}

// Stores the picked images, runs the write with them, then tidies up. Success: the uploads are
// deleted (the WebPs are the record). Failure (a refused image, the rate limit, a ticket that is
// not the author's): the stored WebPs are deleted and the good uploads stay, so a retry needs no
// new upload; the inputs/ lifecycle removes them after 7 days if none comes. Keys must be the
// uploader's own inputs/ keys.
export async function withTicketImages<T>(
  store: ObjectStore,
  target: ImageTarget,
  inputKeys: readonly string[],
  write: (images: TicketImageRow[]) => Promise<T>,
): Promise<T> {
  const keys = [...new Set(inputKeys)]
  // The ticket id may come from the browser (a bound action argument): it becomes part of a key.
  if (!ticketIdSchema.safeParse(target.ticketId).success || !ticketIdSchema.safeParse(target.authorId).success) throw refused('INVALID_INPUT')
  if (keys.length > TICKET_IMAGES_MAX || keys.some((key) => !isOwnInputKey(target.uploaderId, key))) throw refused('INVALID_INPUT')
  const settled = await Promise.allSettled(keys.map((key) => storeOne(store, target, key)))
  const images = settled.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []))
  let result: T
  try {
    const failure = settled.find((outcome) => outcome.status === 'rejected')
    if (failure) throw failure.reason
    result = await write(images)
  } catch (error) {
    await quietlyDelete(store, images.map((image) => image.object_key))
    throw error
  }
  await quietlyDelete(store, keys)
  return result
}

// Short-lived signed URLs for a thread's images; the key never leaves the server. Only called
// after the thread itself was read as the author (RLS) or by an admin.
export async function showMessages(store: ObjectStore, messages: readonly TicketMessage[]): Promise<ShownMessage[]> {
  return Promise.all(
    messages.map(async ({ attachments, ...message }) => ({
      ...message,
      images: await Promise.all(
        attachments.map(async (a) => ({
          id: a.id,
          url: await store.presignGet(a.objectKey, { expiresInSeconds: SIGNED_URL_SECONDS }),
          width: a.width,
          height: a.height,
        })),
      ),
    })),
  )
}
