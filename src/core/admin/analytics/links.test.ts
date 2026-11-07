import { describe, expect, it } from 'vitest'

import { sqlEditorLink, webAnalyticsLink } from './links'

describe('在 PostHog 打开', () => {
  it('opens the block’s own query in the project’s SQL editor', () => {
    const url = new URL(sqlEditorLink('712352', { name: 'x', query: "\n  SELECT count() FROM events WHERE event = 'upload'\n" }))
    expect(url.origin + url.pathname).toBe('https://us.posthog.com/project/712352/sql')
    expect(url.searchParams.get('open_query')).toBe("SELECT count() FROM events WHERE event = 'upload'")
    expect(webAnalyticsLink('712352')).toBe('https://us.posthog.com/project/712352/web')
  })
})
