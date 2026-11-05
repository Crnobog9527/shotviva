import { uploadSizeBucket, type EventProps } from '@/core/analytics/events'
import { isUploadContentType, MAX_UPLOAD_BYTES, type UploadContentType } from '@/core/storage/rules'

export type UploadPhase = 'compressing' | 'uploading'

// Codes match core/errors so the UI maps one set of messages for client and server failures.
export type UploadErrorCode = 'IMAGE_TOO_LARGE' | 'IMAGE_UNSUPPORTED' | 'UPLOAD_FAILED'

export class UploadError extends Error {
  constructor(readonly code: UploadErrorCode, message: string) {
    super(message)
    this.name = 'UploadError'
  }
}

type Ticket = { input_key: string; put_url: string; headers: Record<string, string> }

export type UploadDeps = {
  compress(file: Blob): Promise<Blob>
  requestTicket(contentType: UploadContentType, size: number): Promise<Ticket>
  put(url: string, body: Blob, headers: Record<string, string>, onProgress: (fraction: number) => void): Promise<void>
  // The `upload` event (ARCHITECTURE §16.2), sent once the object is in R2.
  track(props: EventProps<'upload'>): void
}

export type UploadCallbacks = { onPhase(phase: UploadPhase): void; onProgress(fraction: number): void }

// Picker-side checks (AGENTS §6): ≤20MB and JPEG/PNG/WebP. HEIC is refused here instead of
// after a long upload, because the server cannot decode it either.
export function checkPickedFile(file: Blob): UploadContentType {
  if (file.size > MAX_UPLOAD_BYTES) throw new UploadError('IMAGE_TOO_LARGE', 'Photo is larger than 20MB')
  if (!isUploadContentType(file.type)) throw new UploadError('IMAGE_UNSUPPORTED', 'Please use a JPEG, PNG or WebP photo')
  return file.type
}

// Compress → ticket → PUT straight to R2. If the browser cannot compress (old browser, low
// memory) the original goes up through the same presigned PUT and the server resizes it
// (ARCHITECTURE §8.2). Returns the input key for /api/generate.
export async function uploadPhoto(file: Blob, deps: UploadDeps, callbacks: UploadCallbacks): Promise<string> {
  const originalType = checkPickedFile(file)
  callbacks.onPhase('compressing')
  const compressed = await deps.compress(file).catch(() => null)
  const body = compressed ?? file
  const contentType: UploadContentType = compressed ? 'image/jpeg' : originalType

  const ticket = await deps.requestTicket(contentType, body.size)
  callbacks.onPhase('uploading')
  callbacks.onProgress(0)
  try {
    await deps.put(ticket.put_url, body, ticket.headers, callbacks.onProgress)
  } catch {
    throw new UploadError('UPLOAD_FAILED', 'Upload failed; check your connection and try again')
  }
  callbacks.onProgress(1)
  // Bucketed size of the picked photo, not the re-encoded one: that is what users bring.
  deps.track({ size_bucket: uploadSizeBucket(file.size), compressed: compressed !== null })
  return ticket.input_key
}
