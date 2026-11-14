import { afterEach, describe, expect, it, vi } from 'vitest'

import { extractPoster } from './poster-api'

// The route answers a parsed notice as JSON and a model call as NDJSON, cut wherever the network cuts it.
function ndjson(lines: unknown[], chunk = 5) {
  const bytes = new TextEncoder().encode(lines.map((line) => `${JSON.stringify(line)}\n`).join(''))
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let at = 0; at < bytes.length; at += chunk) controller.enqueue(bytes.slice(at, at + chunk))
      controller.close()
    },
  })
  return new Response(body, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8' } })
}

const ok = { status: 'ok', content: { header: { title: '周六大师赛' } }, unverified: [], clipped: [] }

describe('extractPoster', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('passes on each stage of a streamed answer and returns the answer', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ndjson([{ stage: 'header' }, { stage: 'prizes' }, ok])))
    const stages: string[] = []
    await expect(extractPoster('t', 'x', (stage) => stages.push(stage))).resolves.toEqual(ok)
    expect(stages).toEqual(['header', 'prizes'])
  })

  it('reads a plain JSON answer and an error code', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(ok)))
    await expect(extractPoster('t', 'x')).resolves.toEqual(ok)
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ code: 'RATE_LIMITED' }, { status: 429 })))
    await expect(extractPoster('t', 'x')).resolves.toEqual({ status: 'error', code: 'RATE_LIMITED' })
  })

  it('treats a stream cut off before the answer as a network error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ndjson([{ stage: 'header' }])))
    await expect(extractPoster('t', 'x')).resolves.toEqual({ status: 'error', code: 'NETWORK' })
  })
})
