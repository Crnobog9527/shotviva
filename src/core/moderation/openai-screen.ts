import 'server-only'

import { z } from 'zod'

// The automatic screen (ARCHITECTURE §9 第 5 条): OpenAI's Moderation API, model
// omni-moderation-latest, free and without data retention. One request carries the finished
// image (a short-lived signed URL, never the user's uploaded photo) and the text the work page
// would show. Only category names leave this module; the raw response is never stored.

export const MODERATION_MODEL = 'omni-moderation-latest'
const ENDPOINT = 'https://api.openai.com/v1/moderations'
const TIMEOUT_MS = 20_000

export type ScreenInput = { imageUrl: string; text: string | null }
export type ScreenVerdict = { flagged: boolean; categories: string[] }
export type Fetcher = (input: string, init: RequestInit) => Promise<Response>

const responseSchema = z.object({
  results: z
    .array(z.object({ flagged: z.boolean(), categories: z.record(z.string(), z.boolean().nullable()) }))
    .min(1),
})

function requestBody({ imageUrl, text }: ScreenInput) {
  const input: unknown[] = [{ type: 'image_url', image_url: { url: imageUrl } }]
  if (text) input.unshift({ type: 'text', text })
  return { model: MODERATION_MODEL, input }
}

// Any result flagged flags the work; the categories are the union of every flagged one.
export function verdictOf(raw: unknown): ScreenVerdict {
  const { results } = responseSchema.parse(raw)
  const categories = new Set<string>()
  for (const result of results) {
    for (const [name, on] of Object.entries(result.categories)) if (on) categories.add(name)
  }
  return { flagged: results.some((result) => result.flagged), categories: [...categories].sort() }
}

export async function screenWithOpenAI(apiKey: string, input: ScreenInput, fetcher: Fetcher = fetch): Promise<ScreenVerdict> {
  const response = await fetcher(ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody(input)),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  // The status alone: an error body could echo the input back.
  if (!response.ok) throw new Error(`moderation request failed with ${response.status}`)
  return verdictOf(await response.json())
}
