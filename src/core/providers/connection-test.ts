import 'server-only'

import type { ProviderAdapterId } from './types'

// Use OpenRouter's authenticated /key endpoint: its public catalogue is accessible without a key.
// Only the HTTP status leaves this function because a vendor body can echo the request.

// ms: wall time of the one request, so the admin page shows the round trip from the server's
// region (sfo1) to the vendor, e.g. the cross-border hop to Volcano Engine's Beijing endpoint.
export type ConnectionResult =
  | { ok: true; status: number; ms?: number }
  | { ok: false; failure: 'unauthorized' | 'model_unavailable' | 'http_error' | 'redirect' | 'timeout' | 'network'; status?: number; ms?: number }

const TIMEOUT_MS = 10_000

function classify(status: number): ConnectionResult {
  if (status >= 200 && status < 300) return { ok: true, status }
  if (status === 401 || status === 403) return { ok: false, failure: 'unauthorized', status }
  if (status >= 300 && status < 400) return { ok: false, failure: 'redirect', status }
  return { ok: false, failure: 'http_error', status }
}

function isTimeout(error: unknown): boolean {
  return error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')
}

// Ark has no key-only endpoint. An image request without a prompt is rejected as a bad
// parameter (400 MissingParameter / InvalidParameter) only after the key and model pass, and a
// rejected request generates and bills nothing. 401 is a bad key; 403/404 a model not activated
// (ServiceNotOpen / ModelNotOpen) or an overdue account.
const ARK_PARAMETER_ERROR = /^(MissingParameter|InvalidParameter)/

async function arkCode(response: Response): Promise<string | null> {
  const body = await response.json().catch(() => null) as { error?: { code?: unknown } } | null
  return typeof body?.error?.code === 'string' ? body.error.code : null
}

function classifyArk(status: number, code: string | null): ConnectionResult {
  if (status === 400 && code && ARK_PARAMETER_ERROR.test(code)) return { ok: true, status }
  if (status === 401) return { ok: false, failure: 'unauthorized', status }
  if (status === 403 || status === 404) return { ok: false, failure: 'model_unavailable', status }
  return classify(status)
}

type TestTarget = { baseUrl: string; apiKey: string; adapter?: ProviderAdapterId; model?: string }

function requestFor(config: TestTarget): { url: string; init: RequestInit } {
  const auth = { Authorization: `Bearer ${config.apiKey}` }
  if (config.adapter === 'ark_images') return {
    url: `${config.baseUrl}/images/generations`,
    init: { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: config.model ?? '' }) },
  }
  const path = config.adapter === 'openrouter_images' ? 'key' : 'models'
  return { url: `${config.baseUrl}/${path}`, init: { method: 'GET', headers: auth } }
}

async function classifyResponse(response: Response, adapter?: ProviderAdapterId): Promise<ConnectionResult> {
  if (adapter === 'ark_images') return classifyArk(response.status, await arkCode(response))
  await response.body?.cancel().catch(() => undefined)
  return classify(response.status)
}

export async function testConnection(config: TestTarget, fetchImpl: typeof fetch = fetch): Promise<ConnectionResult> {
  const started = performance.now()
  const elapsed = () => Math.round(performance.now() - started)
  const { url, init } = requestFor(config)
  let response: Response
  try {
    response = await fetchImpl(url, {
      ...init,
      // A redirect could lead off the validated host; report it instead of following.
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    })
  } catch (error) {
    return { ok: false, failure: isTimeout(error) ? 'timeout' : 'network', ms: elapsed() }
  }
  const ms = elapsed()
  return { ...(await classifyResponse(response, config.adapter)), ms }
}
