import type { PosterContent, PosterPart } from '@/core/poster'

// The editor's two calls (ARCHITECTURE §5.3). Errors come back as the server's code so the
// editor can show its own words.

export type ExtractReply =
  | { status: 'ok'; content: PosterContent; unverified: string[] }
  | { status: 'unavailable' | 'failed' }
  | { status: 'error'; code: string }

export type SaveReply = { ok: true; id: string; parts: PosterPart[] } | { ok: false; code: string; message: string }

async function post(path: string, body: unknown): Promise<{ ok: boolean; json: Record<string, unknown> }> {
  try {
    const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    return { ok: response.ok, json: (await response.json().catch(() => ({}))) as Record<string, unknown> }
  } catch {
    return { ok: false, json: { code: 'NETWORK' } }
  }
}

const codeOf = (json: Record<string, unknown>) => (typeof json.code === 'string' ? json.code : 'INTERNAL')

export async function extractPoster(templateId: string, text: string): Promise<ExtractReply> {
  const { ok, json } = await post('/api/poster/extract', { template_id: templateId, text })
  return ok ? (json as ExtractReply) : { status: 'error', code: codeOf(json) }
}

export async function savePosterSet(templateId: string, content: PosterContent, source: 'paste' | 'manual'): Promise<SaveReply> {
  const { ok, json } = await post('/api/poster/sets', { template_id: templateId, content, source })
  if (ok) return { ok: true, id: String(json.id), parts: json.parts as PosterPart[] }
  return { ok: false, code: codeOf(json), message: typeof json.message === 'string' ? json.message : '' }
}
