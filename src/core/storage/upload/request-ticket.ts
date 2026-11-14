import type { UploadContentType } from '../rules'

import { UploadError, type UploadErrorCode } from './upload-photo'

type Ticket = { input_key: string; put_url: string; headers: Record<string, string> }
type Failure = { code?: string; message?: string }

const SERVER_CODES: readonly string[] = ['IMAGE_TOO_LARGE', 'IMAGE_UNSUPPORTED']

function toUploadError(body: Failure | null): UploadError {
  const code = (body?.code && SERVER_CODES.includes(body.code) ? body.code : 'UPLOAD_FAILED') as UploadErrorCode
  return new UploadError(code, body?.message || 'Upload failed')
}

// POST /api/uploads: the server picks the key and signs a 60-second PUT.
export async function requestTicket(contentType: UploadContentType, size: number, endpoint = '/api/uploads'): Promise<Ticket> {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content_type: contentType, size }),
  })
  const body = (await response.json().catch(() => null)) as (Ticket & Failure) | null
  if (!response.ok || !body?.put_url) throw toUploadError(body)
  return body
}
