import { POSTHOG_APP_HOST, type HogQL } from './posthog-query'

// 「在 PostHog 打开」 (ARCHITECTURE §16.2a): the block's own query in PostHog's SQL editor
// (/project/:id/sql?open_query=…, read 2026-11-08 in PostHog's frontend urls.ts), so the Owner
// sees the same numbers there and can change the query; and the Web analytics page for pages.

export function sqlEditorLink(projectId: string, query: HogQL): string {
  const url = new URL(`/project/${encodeURIComponent(projectId)}/sql`, POSTHOG_APP_HOST)
  url.searchParams.set('open_query', query.query.trim())
  return url.toString()
}

export function webAnalyticsLink(projectId: string): string {
  return new URL(`/project/${encodeURIComponent(projectId)}/web`, POSTHOG_APP_HOST).toString()
}
