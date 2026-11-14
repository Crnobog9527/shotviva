import { describe, expect, it } from 'vitest'

import { loadTemplates, templateBuyersQuery, templateUseQuery } from './templates'
import { fakeRun, WEEK } from './test-samples'

describe('模板表现', () => {
  it('counts views and uses per template, and buyers who paid after using it', () => {
    expect(templateUseQuery(WEEK).query).toContain("event IN ('template_view', 'generate')")
    const buyers = templateBuyersQuery(WEEK).query
    expect(buyers).toContain('INNER JOIN')
    expect(buyers).toContain('p.last_paid >= g.first_use')
  })

  it('merges the two recorded answers and drops events without a template', async () => {
    const rows = await loadTemplates(fakeRun(), WEEK)
    expect(rows).toEqual([
      { templateId: 'ramen-studio', views: 420, uses: 310, users: 120, successRate: 295 / 310, buyers: 11 },
      { templateId: 'white-ground', views: 260, uses: 180, users: 90, successRate: 171 / 180, buyers: 4 },
      { templateId: 'night-market', views: 80, uses: 0, users: 0, successRate: null, buyers: 0 },
    ])
  })
})
