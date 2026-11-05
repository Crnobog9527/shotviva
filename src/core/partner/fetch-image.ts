import 'server-only'

import { AppError } from '../errors'
import { normalizeInputImage, sniffImageType } from '../storage'
import { isUploadContentType, MAX_UPLOAD_BYTES } from '../storage/rules'
import { allowlistedUrl } from './return-to'

// The optional `image` of POST /api/partner/generate is a URL the server fetches, so it is an
// SSRF surface (TASKS T7, control window 2026-11-05). Defences, all before any credit moves:
//   - https + exact allowlisted Graylum host (no IPs, ports, credentials)
//   - redirects are refused, not followed, so the host check cannot be bypassed
//   - timeout, Content-Length check and a hard byte cap while streaming
//   - magic-number sniff + a real decode, then downsized to the 2048 long edge like uploads

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>

const FETCH_TIMEOUT_MS = 20_000

const invalid = (message: string) => new AppError('INVALID_INPUT', message)
const tooLarge = () => new AppError('IMAGE_TOO_LARGE', 'Image is larger than 20MB')
const unsupported = () => new AppError('IMAGE_UNSUPPORTED', 'Image must be a JPEG, PNG or WebP')

async function readCapped(response: Response, maxBytes: number): Promise<Uint8Array> {
  if (!response.body) return new Uint8Array()
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined)
      throw tooLarge()
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

async function download(url: URL, fetchFn: FetchLike, maxBytes: number): Promise<Uint8Array> {
  let response: Response
  try {
    response = await fetchFn(url.toString(), {
      redirect: 'manual',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { accept: 'image/jpeg,image/png,image/webp' },
    })
  } catch {
    throw invalid('Image could not be fetched')
  }
  if (response.status !== 200) {
    await response.body?.cancel().catch(() => undefined)
    throw invalid(`Image could not be fetched (HTTP ${response.status})`)
  }
  const declared = Number(response.headers.get('content-length') ?? '')
  if (Number.isFinite(declared) && declared > maxBytes) {
    await response.body?.cancel().catch(() => undefined)
    throw tooLarge()
  }
  return readCapped(response, maxBytes)
}

// → a ≤2048 JPEG ready to store under inputs/{user}/ and feed to runGeneration.
export async function fetchPartnerImage(
  rawUrl: string,
  options: { hosts: readonly string[]; fetch?: FetchLike; maxBytes?: number },
): Promise<Uint8Array> {
  const url = allowlistedUrl(rawUrl, options.hosts)
  if (!url) throw invalid('image must be an https URL on an allowed Graylum host')
  const bytes = await download(url, options.fetch ?? fetch, options.maxBytes ?? MAX_UPLOAD_BYTES)
  const sniffed = sniffImageType(bytes)
  if (!sniffed || !isUploadContentType(sniffed)) throw unsupported()
  try {
    return await normalizeInputImage(bytes)
  } catch {
    throw unsupported()
  }
}
