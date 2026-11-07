import { isUploadContentType, type UploadContentType } from '../../storage/rules'
import { compressImage, putWithProgress, requestTicket, UploadError } from '../../storage/upload'
import { TICKET_IMAGE_MAX_BYTES } from '../rules'

// One picked ticket image, the generation upload's way (ARCHITECTURE §8.2, T69): re-encode to
// a ≤2048px JPEG in the browser (EXIF gone; HEIC decoded here, since the server cannot), ask
// /api/uploads for a presigned PUT, send it straight to R2. Returns the inputs/ key the form
// sends; the server re-checks everything and stores WebP.

const HEIC = /^image\/hei[cf](-sequence)?$/
const HEIC_NAME = /\.hei[cf]$/i

export function isHeic(file: { type: string; name?: string }): boolean {
  return HEIC.test(file.type) || (!file.type && HEIC_NAME.test(file.name ?? ''))
}

// Picker-side checks: ≤10 MB as picked, and a JPEG, PNG, WebP or HEIC image.
export function checkTicketImage(file: { type: string; size: number; name?: string }): void {
  if (file.size > TICKET_IMAGE_MAX_BYTES) throw new UploadError('IMAGE_TOO_LARGE', 'Image is larger than 10MB')
  if (!isUploadContentType(file.type) && !isHeic(file)) throw new UploadError('IMAGE_UNSUPPORTED', 'Please use a JPEG, PNG, WebP or HEIC image')
}

export type TicketUploadDeps = {
  compress(file: Blob): Promise<Blob>
  requestTicket: typeof requestTicket
  put: typeof putWithProgress
}

const browserDeps: TicketUploadDeps = { compress: compressImage, requestTicket, put: putWithProgress }

export async function uploadTicketImage(
  file: File,
  onProgress: (fraction: number) => void,
  signal: AbortSignal,
  deps: TicketUploadDeps = browserDeps,
): Promise<string> {
  checkTicketImage(file)
  const compressed = await deps.compress(file).catch(() => null)
  // An undecodable HEIC has no way through: the server cannot read it either.
  if (!compressed && isHeic(file)) throw new UploadError('IMAGE_UNSUPPORTED', 'This browser cannot read HEIC images')
  const body = compressed ?? file
  const contentType = (compressed ? 'image/jpeg' : file.type) as UploadContentType
  if (signal.aborted) throw new DOMException('upload cancelled', 'AbortError')
  const ticket = await deps.requestTicket(contentType, body.size)
  try {
    await deps.put(ticket.put_url, body, ticket.headers, onProgress, signal)
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new UploadError('UPLOAD_FAILED', 'Upload failed; check your connection and try again')
  }
  return ticket.input_key
}
