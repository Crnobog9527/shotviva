import 'server-only'

// "Test connection" on the admin page (ARCHITECTURE §3.3): GET {base_url}/models with the row's
// key. It only proves the key authenticates; it never generates, so it costs nothing. Only the
// HTTP status leaves this function: a vendor body can echo the request.

export type ConnectionResult =
  | { ok: true; status: number }
  | { ok: false; failure: 'unauthorized' | 'http_error' | 'redirect' | 'timeout' | 'network'; status?: number }

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

export async function testConnection(
  config: { baseUrl: string; apiKey: string },
  fetchImpl: typeof fetch = fetch,
): Promise<ConnectionResult> {
  let response: Response
  try {
    response = await fetchImpl(`${config.baseUrl}/models`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${config.apiKey}` },
      // A redirect could lead off the validated host; report it instead of following.
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    })
  } catch (error) {
    return { ok: false, failure: isTimeout(error) ? 'timeout' : 'network' }
  }
  await response.body?.cancel().catch(() => undefined)
  return classify(response.status)
}
