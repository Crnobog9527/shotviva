import { z } from 'zod'

import { failOnStatus, fetchFailure, OpenAICostsError } from './openai-costs'

// OpenRouter's billed usage per UTC day, from the Activity API (read 2026-11-13 at
// openrouter.ai/docs/api/api-reference/analytics/get-user-activity): GET /api/v1/activity with a
// management (provisioning) key — an ordinary inference key gets 403. It covers the last 30
// completed UTC days (today is not in it), one item per day × model × endpoint, `usage` in USD.
// The whole account is counted, every model and every key. Plain fetch so tests inject a fake.

export const OPENROUTER_ACTIVITY_URL = 'https://openrouter.ai/api/v1/activity'
const TIMEOUT_MS = 15_000

const bodySchema = z.object({
  data: z.array(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}/), usage: z.coerce.number() })),
})

// USD billed per UTC day ('YYYY-MM-DD' → dollars). Days without activity are absent.
export async function fetchOpenRouterActivity(apiKey: string, fetchImpl: typeof fetch = fetch): Promise<Record<string, number>> {
  let response: Response
  try {
    response = await fetchImpl(OPENROUTER_ACTIVITY_URL, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: 'error',
    })
  } catch (error) {
    throw fetchFailure(error)
  }
  await failOnStatus(response)
  const parsed = bodySchema.safeParse(await response.json().catch(() => null))
  if (!parsed.success) throw new OpenAICostsError('bad_response', response.status)
  const byDay: Record<string, number> = {}
  for (const item of parsed.data.data) {
    const day = item.date.slice(0, 10)
    byDay[day] = (byDay[day] ?? 0) + item.usage
  }
  return byDay
}
