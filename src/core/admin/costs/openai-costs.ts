import { z } from 'zod'

// OpenAI's billed cost per UTC day, from the Costs API (ARCHITECTURE §10.0; read 2026-11-06 at
// developers.openai.com/api/reference/resources/admin/subresources/organization/subresources/usage):
// GET /v1/organization/costs with an Admin key; start_time / end_time in Unix seconds;
// bucket_width '1d' (the only width); project_ids[] to scope it; limit up to 180 buckets;
// paged with has_more / next_page. Each bucket's results carry amount { value, currency }.
// Plain fetch so tests inject a fake. The key is only ever in the Authorization header.

export const OPENAI_COSTS_URL = 'https://api.openai.com/v1/organization/costs'
const TIMEOUT_MS = 15_000
const MAX_PAGES = 5

const pageSchema = z.object({
  data: z.array(
    z.object({
      start_time: z.number(),
      results: z.array(z.object({ amount: z.object({ value: z.coerce.number(), currency: z.string() }).nullish() })),
    }),
  ),
  has_more: z.boolean().optional(),
  next_page: z.string().nullish(),
})

export type CostsFailure = 'unauthorized' | 'http_error' | 'network' | 'timeout' | 'bad_response'

// Thrown so a 'use cache' caller never caches a failure. The message carries no key.
export class OpenAICostsError extends Error {
  readonly failure: CostsFailure
  readonly status: number | null

  constructor(failure: CostsFailure, status: number | null = null) {
    super(`openai costs ${failure}${status === null ? '' : ` (HTTP ${status})`}`)
    this.name = 'OpenAICostsError'
    this.failure = failure
    this.status = status
  }
}

export type CostsQuery = { apiKey: string; projectId: string | null; startDay: string; days: number }

const dayStart = (day: string) => Date.parse(`${day}T00:00:00Z`) / 1000
const utcDay = (seconds: number) => new Date(seconds * 1000).toISOString().slice(0, 10)

function pageUrl(query: CostsQuery, page: string | null): string {
  const url = new URL(OPENAI_COSTS_URL)
  const start = dayStart(query.startDay)
  url.searchParams.set('start_time', String(start))
  url.searchParams.set('end_time', String(start + query.days * 86_400))
  url.searchParams.set('bucket_width', '1d')
  url.searchParams.set('limit', String(query.days))
  if (query.projectId) url.searchParams.append('project_ids[]', query.projectId)
  if (page) url.searchParams.set('page', page)
  return url.toString()
}

async function getPage(query: CostsQuery, page: string | null, fetchImpl: typeof fetch) {
  let response: Response
  try {
    response = await fetchImpl(pageUrl(query, page), {
      headers: { Authorization: `Bearer ${query.apiKey}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: 'error',
    })
  } catch (error) {
    throw new OpenAICostsError(error instanceof Error && error.name === 'TimeoutError' ? 'timeout' : 'network')
  }
  if (response.status === 401 || response.status === 403) throw new OpenAICostsError('unauthorized', response.status)
  if (!response.ok) throw new OpenAICostsError('http_error', response.status)
  const parsed = pageSchema.safeParse(await response.json().catch(() => null))
  if (!parsed.success) throw new OpenAICostsError('bad_response', response.status)
  return parsed.data
}

// USD billed per UTC day ('YYYY-MM-DD' → dollars). Days OpenAI returns no bucket for are absent.
export async function fetchOpenAICosts(query: CostsQuery, fetchImpl: typeof fetch = fetch): Promise<Record<string, number>> {
  const byDay: Record<string, number> = {}
  let page: string | null = null
  for (let i = 0; i < MAX_PAGES; i++) {
    const body = await getPage(query, page, fetchImpl)
    for (const bucket of body.data) {
      const usd = bucket.results.reduce((sum, r) => sum + (r.amount && r.amount.currency.toLowerCase() === 'usd' ? r.amount.value : 0), 0)
      const day = utcDay(bucket.start_time)
      byDay[day] = (byDay[day] ?? 0) + usd
    }
    if (!body.has_more || !body.next_page) return byDay
    page = body.next_page
  }
  return byDay
}
