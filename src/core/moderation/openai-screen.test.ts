import { describe, expect, it, vi } from 'vitest'

import { MODERATION_MODEL, screenWithOpenAI, verdictOf } from './openai-screen'

// ARCHITECTURE §9 第 5 条: one request, image + shown text; only category names come back.
describe('screenWithOpenAI', () => {
  it('sends the image URL and the text to omni-moderation-latest', async () => {
    const fetcher = vi.fn(async () => Response.json({ results: [{ flagged: false, categories: { sexual: false } }] }))
    const verdict = await screenWithOpenAI('k', { imageUrl: 'https://r2/x', text: 'Salmon' }, fetcher)
    expect(verdict).toEqual({ flagged: false, categories: [] })
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.openai.com/v1/moderations')
    expect(JSON.parse(String(init.body))).toEqual({
      model: MODERATION_MODEL,
      input: [{ type: 'text', text: 'Salmon' }, { type: 'image_url', image_url: { url: 'https://r2/x' } }],
    })
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer k')
  })

  it('sends the image alone when there is no text', async () => {
    const fetcher = vi.fn(async () => Response.json({ results: [{ flagged: false, categories: {} }] }))
    await screenWithOpenAI('k', { imageUrl: 'u', text: null }, fetcher)
    const body = JSON.parse(String((fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].body))
    expect(body.input).toEqual([{ type: 'image_url', image_url: { url: 'u' } }])
  })

  it('throws on an error status without reading the body', async () => {
    const fetcher = vi.fn(async () => new Response('echo of input', { status: 429 }))
    await expect(screenWithOpenAI('k', { imageUrl: 'u', text: null }, fetcher)).rejects.toThrow('429')
  })
})

describe('verdictOf', () => {
  it('flags when any result is flagged and returns the flagged category names sorted', () => {
    expect(
      verdictOf({
        results: [
          { flagged: false, categories: { violence: false } },
          { flagged: true, categories: { violence: true, sexual: true, hate: null } },
        ],
      }),
    ).toEqual({ flagged: true, categories: ['sexual', 'violence'] })
  })

  it('refuses a response without results', () => {
    expect(() => verdictOf({ results: [] })).toThrow()
  })
})
