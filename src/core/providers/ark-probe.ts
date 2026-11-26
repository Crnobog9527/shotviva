import 'server-only'

import { ARK_BASE_URL } from './types'

// Admin diagnosis for 2026-11-26: production could not open a connection to Ark Beijing
// (UND_ERR_CONNECT_TIMEOUT). Opens one unauthenticated request to Ark's model list (Ark answers
// 401 without a key, which proves the route is open) from the region the function runs in, a few
// times, and reports only timings and codes. No key is sent and nothing is generated or billed.
export type ArkProbeAttempt = { ok: boolean; status: number | null; ms: number; code: string | null }

function codeOf(error: unknown): string {
  const cause = error instanceof Error ? error.cause : undefined
  const code = cause && typeof cause === 'object' && 'code' in cause ? cause.code : undefined
  if (typeof code === 'string' && /^[A-Z0-9_]{2,40}$/.test(code)) return code
  return error instanceof Error ? error.name : 'unknown'
}

async function attempt(fetcher: typeof fetch): Promise<ArkProbeAttempt> {
  const started = Date.now()
  try {
    const response = await fetcher(`${ARK_BASE_URL}/models`, { method: 'GET', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(8_000) })
    await response.body?.cancel()
    return { ok: true, status: response.status, ms: Date.now() - started, code: null }
  } catch (error) {
    return { ok: false, status: null, ms: Date.now() - started, code: codeOf(error) }
  }
}

export async function probeArk(fetcher: typeof fetch = fetch, tries = 3): Promise<{ region: string; attempts: ArkProbeAttempt[] }> {
  const attempts: ArkProbeAttempt[] = []
  for (let i = 0; i < tries; i++) attempts.push(await attempt(fetcher))
  // Platform-set, not configuration: the region this function instance runs in.
  // eslint-disable-next-line no-restricted-syntax
  return { region: process.env.VERCEL_REGION ?? 'local', attempts }
}
