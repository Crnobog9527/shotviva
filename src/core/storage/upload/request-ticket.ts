import { retryDelayMs, sleep } from '../../retry-after'
import type { UploadContentType } from '../rules'

import { UploadError, type UploadErrorCode } from './upload-photo'

type Ticket = { input_key: string; put_url: string; headers: Record<string, string> }
type Failure = { code?: string; message?: string }

const SERVER_CODES: readonly string[] = ['IMAGE_TOO_LARGE', 'IMAGE_UNSUPPORTED']

// A 429 (the firewall's per-IP limit, or RATE_LIMITED) is a wait, not a failure: a batch from a
// shared office IP waits its turn and goes on (queue-fairness plan §5). Past this long it gives up.
export const TICKET_WAIT_LIMIT_MS = 3 * 60 * 1000

function toUploadError(body: Failure | null): UploadError {
  const code = (body?.code && SERVER_CODES.includes(body.code) ? body.code : 'UPLOAD_FAILED') as UploadErrorCode
  return new UploadError(code, body?.message || 'Upload failed')
}

// signal: the photo was cancelled; the wait between retries stops at once (AbortError).
export type TicketOptions = { signal?: AbortSignal; endpoint?: string; wait?: (ms: number, signal?: AbortSignal) => Promise<void>; now?: () => number; random?: () => number }

function post(endpoint: string, contentType: UploadContentType, size: number) {
  return fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content_type: contentType, size }),
  })
}

// POST /api/uploads: the server picks the key and signs a 60-second PUT.
export async function requestTicket(contentType: UploadContentType, size: number, options: TicketOptions = {}): Promise<Ticket> {
  const endpoint = options.endpoint ?? '/api/uploads'
  const wait = options.wait ?? sleep
  const now = options.now ?? Date.now
  const random = options.random ?? Math.random
  const started = now()
  let response = await post(endpoint, contentType, size)
  while (response.status === 429) {
    const delay = retryDelayMs(response.headers.get('Retry-After'), random, now())
    if (now() + delay - started > TICKET_WAIT_LIMIT_MS) break
    await wait(delay, options.signal)
    response = await post(endpoint, contentType, size)
  }
  return readTicket(response)
}

async function readTicket(response: Response): Promise<Ticket> {
  const body = (await response.json().catch(() => null)) as (Ticket & Failure) | null
  if (!response.ok || !body?.put_url) throw toUploadError(body)
  return body
}
