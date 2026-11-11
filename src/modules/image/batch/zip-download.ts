import type { MembershipTier } from '@/core/config'

// The batch ZIP (T107): GET /api/generate/batch/{id}/download builds the archive of this
// account's paid, finished photos in the batch (照片名_模板名_序号.png) and answers 302 to a
// short signed link; 202 while another request is still packing the same batch, 429 past three
// requests a minute, 403 TIER_REQUIRED below Pro. The first request is a fetch that does not
// follow the redirect, so a 202 or 429 never lands the browser on a JSON page; once it says
// ready, the browser goes to the same route, which finds the archive already built and only
// signs a fresh link.
export const zipRoute = (batchId: string) => `/api/generate/batch/${batchId}/download`

export type ZipOutcome =
  | { kind: 'ready' }
  | { kind: 'packing'; retryAfterMs: number }
  | { kind: 'limited'; retryAfterMs: number }
  | { kind: 'upgrade'; tier: MembershipTier }
  | { kind: 'error'; code: string }

const DEFAULT_WAIT_MS = 60_000

function retryAfter(response: Response): number {
  const seconds = Number(response.headers.get('Retry-After'))
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : DEFAULT_WAIT_MS
}

export async function readZipOutcome(response: Response): Promise<ZipOutcome> {
  // A redirect not followed reads as an opaque response with status 0.
  if (response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400)) return { kind: 'ready' }
  if (response.status === 202) return { kind: 'packing', retryAfterMs: retryAfter(response) }
  if (response.status === 429) return { kind: 'limited', retryAfterMs: retryAfter(response) }
  const body = (await response.json().catch(() => ({}))) as { code?: string; required_tier?: MembershipTier }
  if (body.code === 'TIER_REQUIRED') return { kind: 'upgrade', tier: body.required_tier ?? 'pro' }
  return { kind: 'error', code: body.code ?? 'INTERNAL' }
}

export async function requestZip(batchId: string, fetcher: typeof fetch = fetch): Promise<ZipOutcome> {
  try {
    return await readZipOutcome(await fetcher(zipRoute(batchId), { redirect: 'manual', cache: 'no-store' }))
  } catch {
    return { kind: 'error', code: 'NETWORK' }
  }
}

// What the button shows. 'packing' covers both our own request building the archive and a
// 202 (someone else is building it; we ask again after Retry-After).
export type ZipState =
  | { kind: 'idle' }
  | { kind: 'packing' }
  | { kind: 'started' }
  | { kind: 'limited' }
  | { kind: 'error'; code: string }

export function stateAfter(outcome: ZipOutcome): ZipState {
  if (outcome.kind === 'ready') return { kind: 'started' }
  if (outcome.kind === 'packing') return { kind: 'packing' }
  if (outcome.kind === 'limited') return { kind: 'limited' }
  if (outcome.kind === 'upgrade') return { kind: 'idle' }
  return { kind: 'error', code: outcome.code }
}
