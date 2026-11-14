import { uploadSizeBucket } from '../../analytics/event-values'
import type { EventProps } from '../../analytics/events'
import { isUploadContentType, MAX_UPLOAD_BYTES, type UploadContentType } from '../rules'

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
  put(url: string, body: Blob, headers: Record<string, string>, onProgress: (fraction: number) => void, signal?: AbortSignal): Promise<void>
  // The `upload` event (ARCHITECTURE §16.2), sent once the object is in R2.
  track(props: EventProps<'upload'>): void
  // `upload_error` (T74): why it failed, as an enum; never the file name or the message.
  trackError(reason: EventProps<'upload_error'>['reason']): void
}

// signal: cancelling one photo of a batch stops its PUT; the compressed blob is just dropped.
export type UploadCallbacks = { onPhase(phase: UploadPhase): void; onProgress(fraction: number): void; signal?: AbortSignal }

export const isAbort = (error: unknown) => error instanceof DOMException && error.name === 'AbortError'

function throwIfAborted(signal: AbortSignal | undefined) {
  if (signal?.aborted) throw new DOMException('upload cancelled', 'AbortError')
}

// Picker-side checks (AGENTS §6): ≤20MB and JPEG/PNG/WebP. HEIC is refused here instead of
// after a long upload, because the server cannot decode it either.
export function checkPickedFile(file: Blob): UploadContentType {
  if (file.size > MAX_UPLOAD_BYTES) throw new UploadError('IMAGE_TOO_LARGE', 'Photo is larger than 20MB')
  if (!isUploadContentType(file.type)) throw new UploadError('IMAGE_UNSUPPORTED', 'Please use a JPEG, PNG or WebP photo')
  return file.type
}

export type UploadErrorReason = EventProps<'upload_error'>['reason']

// The `upload_error` reason for a failure; null for a cancel, which is not a failure.
export function uploadErrorReason(error: unknown, stage: 'pick' | 'ticket' | 'transfer'): UploadErrorReason | null {
  if (isAbort(error)) return null
  if (error instanceof UploadError && error.code === 'IMAGE_TOO_LARGE') return 'too_large'
  if (error instanceof UploadError && error.code === 'IMAGE_UNSUPPORTED') return 'unsupported'
  if (stage === 'ticket') return 'ticket_failed'
  return stage === 'transfer' ? 'transfer_failed' : 'unknown'
}

// Compress → ticket → PUT straight to R2. If the browser cannot compress (old browser, low
// memory) the original goes up through the same presigned PUT and the server resizes it
// (ARCHITECTURE §8.2). Returns the input key for /api/generate. Every failure but a cancel is
// counted once as `upload_error` (T74) and rethrown unchanged.
export async function uploadPhoto(file: Blob, deps: UploadDeps, callbacks: UploadCallbacks): Promise<string> {
  const stage = { current: 'pick' as 'pick' | 'ticket' | 'transfer' }
  try {
    return await runUpload(file, deps, callbacks, stage)
  } catch (error) {
    const reason = uploadErrorReason(error, stage.current)
    if (reason) deps.trackError(reason)
    throw error
  }
}

async function runUpload(file: Blob, deps: UploadDeps, callbacks: UploadCallbacks, stage: { current: 'pick' | 'ticket' | 'transfer' }): Promise<string> {
  const originalType = checkPickedFile(file)
  callbacks.onPhase('compressing')
  const compressed = await deps.compress(file).catch(() => null)
  throwIfAborted(callbacks.signal)
  const body = compressed ?? file
  const contentType: UploadContentType = compressed ? 'image/jpeg' : originalType

  stage.current = 'ticket'
  const ticket = await deps.requestTicket(contentType, body.size)
  throwIfAborted(callbacks.signal)
  stage.current = 'transfer'
  callbacks.onPhase('uploading')
  callbacks.onProgress(0)
  try {
    await deps.put(ticket.put_url, body, ticket.headers, callbacks.onProgress, callbacks.signal)
  } catch (error) {
    if (isAbort(error)) throw error
    throw new UploadError('UPLOAD_FAILED', 'Upload failed; check your connection and try again')
  }
  callbacks.onProgress(1)
  // Bucketed size of the picked photo, not the re-encoded one: that is what users bring.
  deps.track({ size_bucket: uploadSizeBucket(file.size), compressed: compressed !== null })
  return ticket.input_key
}
