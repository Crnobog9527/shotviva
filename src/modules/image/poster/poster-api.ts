import type { PosterBlock, PosterContent, PosterPart } from '@/core/poster'

import { readPieces } from './read-pieces'

// The editor's two calls (ARCHITECTURE §5.3). Errors come back as the server's code so the
// editor can show its own words.

export type ExtractReply =
  | { status: 'ok'; content: PosterContent; unverified: string[]; clipped?: string[] }
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

// The model's NDJSON: { stage } lines as each block starts, the answer last.
async function readProgress(body: ReadableStream<Uint8Array>, onStage?: (stage: PosterBlock) => void): Promise<ExtractReply> {
  let last: ExtractReply = { status: 'error', code: 'NETWORK' }
  const take = (line: string) => {
    if (!line.trim()) return
    const value = JSON.parse(line) as { stage?: PosterBlock } & ExtractReply
    if (value.stage) onStage?.(value.stage)
    else last = value
  }
  await readPieces(body, '\n', take)
  return last
}

// The parser's answer is plain JSON; the model's is NDJSON, so the editor can show progress
// while the model writes.
export async function extractPoster(templateId: string, text: string, onStage?: (stage: PosterBlock) => void): Promise<ExtractReply> {
  try {
    const response = await fetch('/api/poster/extract', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ template_id: templateId, text }) })
    if (!response.ok) return { status: 'error', code: codeOf((await response.json().catch(() => ({}))) as Record<string, unknown>) }
    if (response.body && response.headers.get('Content-Type')?.includes('ndjson')) return await readProgress(response.body, onStage)
    return ((await response.json().catch(() => null)) as ExtractReply | null) ?? { status: 'error', code: 'INTERNAL' }
  } catch {
    return { status: 'error', code: 'NETWORK' }
  }
}

export async function savePosterSet(templateId: string, content: PosterContent, source: 'paste' | 'photo' | 'reuse' | 'manual'): Promise<SaveReply> {
  const { ok, json } = await post('/api/poster/sets', { template_id: templateId, content, source })
  if (ok) return { ok: true, id: String(json.id), parts: json.parts as PosterPart[] }
  return { ok: false, code: codeOf(json), message: typeof json.message === 'string' ? json.message : '' }
}

// 拍照识别: the uploaded photo of an old poster, read and sorted like a paste; `text` is what the
// photo said, shown beside the blocks like a pasted notice.
export type PhotoReply = ExtractReply & { text?: string }

export async function extractPosterPhoto(templateId: string, inputKey: string, onStage?: (stage: PosterBlock) => void): Promise<PhotoReply> {
  try {
    const response = await fetch('/api/poster/extract-photo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ template_id: templateId, input_key: inputKey }) })
    if (!response.ok) return { status: 'error', code: codeOf((await response.json().catch(() => ({}))) as Record<string, unknown>) }
    if (response.body && response.headers.get('Content-Type')?.includes('ndjson')) return await readProgress(response.body, onStage)
    return ((await response.json().catch(() => null)) as PhotoReply | null) ?? { status: 'error', code: 'INTERNAL' }
  } catch {
    return { status: 'error', code: 'NETWORK' }
  }
}
