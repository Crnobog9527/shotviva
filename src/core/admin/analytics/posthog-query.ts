import { z } from 'zod'

// PostHog's Query API (ARCHITECTURE §16.2a, T74; read 2026-11-08 at posthog.com/docs/api/queries):
// POST https://us.posthog.com/api/projects/:project_id/query/ with
// { query: { kind: 'HogQLQuery', query }, name } and `Authorization: Bearer <personal API key>`
// (Query Read permission). A HogQL answer carries `results` (rows as arrays) and `columns`.
// Project limits: 2,400 requests an hour, 240 a minute, 3 running at once (a full queue waits up
// to 30 s), 10 s of execution each; an exhausted read budget answers 429
// `api_queries_budget_exceeded`. Default 100 rows; every query here sets its own LIMIT.
// Plain fetch so tests inject a fake. The key is only ever in the Authorization header.

export const POSTHOG_APP_HOST = 'https://us.posthog.com'
// The 10 s execution limit plus up to 30 s waiting in PostHog's queue, then give up.
const TIMEOUT_MS = 45_000

export type PostHogAccess = { apiKey: string; projectId: string }

export type QueryFailure = 'unauthorized' | 'rate_limited' | 'http_error' | 'network' | 'timeout' | 'bad_response'

// Thrown so a 'use cache' caller never caches a failure. The message carries no key.
export class PostHogQueryError extends Error {
  readonly failure: QueryFailure
  readonly status: number | null

  constructor(failure: QueryFailure, status: number | null = null) {
    super(`posthog query ${failure}${status === null ? '' : ` (HTTP ${status})`}`)
    this.name = 'PostHogQueryError'
    this.failure = failure
    this.status = status
  }
}

const answerSchema = z.object({
  results: z.array(z.array(z.unknown())),
  columns: z.array(z.string()),
})

export type QueryAnswer = z.infer<typeof answerSchema>

// One named HogQL query; `name` shows up in PostHog's query_log, so it says which block asked.
export type HogQL = { name: string; query: string }

export type RunQuery = (query: HogQL) => Promise<QueryAnswer>

function failureFor(status: number): QueryFailure {
  if (status === 401 || status === 403) return 'unauthorized'
  return status === 429 ? 'rate_limited' : 'http_error'
}

async function post(access: PostHogAccess, query: HogQL, fetchImpl: typeof fetch): Promise<Response> {
  try {
    return await fetchImpl(`${POSTHOG_APP_HOST}/api/projects/${encodeURIComponent(access.projectId)}/query/`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${access.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: { kind: 'HogQLQuery', query: query.query }, name: `shotviva-admin: ${query.name}` }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: 'error',
    })
  } catch (error) {
    throw new PostHogQueryError(error instanceof Error && error.name === 'TimeoutError' ? 'timeout' : 'network')
  }
}

export async function runHogQL(access: PostHogAccess, query: HogQL, fetchImpl: typeof fetch = fetch): Promise<QueryAnswer> {
  const response = await post(access, query, fetchImpl)
  if (!response.ok) throw new PostHogQueryError(failureFor(response.status), response.status)
  const parsed = answerSchema.safeParse(await response.json().catch(() => null))
  if (!parsed.success) throw new PostHogQueryError('bad_response', response.status)
  return parsed.data
}

export function queryRunner(access: PostHogAccess, fetchImpl: typeof fetch = fetch): RunQuery {
  return (query) => runHogQL(access, query, fetchImpl)
}

// Rows as objects by column name, each checked against the block's own row schema; a row that
// does not fit fails the whole block (shown as 「暂时读不到」) rather than drawing wrong numbers.
export function rowsOf<T extends z.ZodType>(answer: QueryAnswer, row: T): z.infer<T>[] {
  const objects = answer.results.map((values) => Object.fromEntries(answer.columns.map((column, i) => [column, values[i]])))
  const parsed = z.array(row).safeParse(objects)
  if (!parsed.success) throw new PostHogQueryError('bad_response')
  return parsed.data
}
