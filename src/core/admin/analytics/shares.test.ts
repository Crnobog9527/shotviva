import { describe, expect, it } from 'vitest'

import { shapeShares, shareFunnelQuery } from './shares'

const window = { range: '7d', start: '2026-11-06T16:00:00.000Z', end: '2026-11-13T16:00:00.000Z', prevStart: '2026-10-30T16:00:00.000Z', prevEnd: '2026-11-06T16:00:00.000Z' } as const

describe('模板分享 block (Owner 2026-11-13)', () => {
  it('reads every share event and the share-marked signups in one query', () => {
    const { query } = shareFunnelQuery(window)
    for (const event of ['template_share', 'template_share_open', 'template_share_signup_start', 'template_share_generate']) expect(query).toContain(`'${event}'`)
    expect(query).toContain("event = 'signup' AND toString(properties.share_template_id) != ''")
  })

  it('shapes the counts, and zeros with no row', () => {
    expect(shapeShares([{ share_presses: 5, shares: 3, open_loads: 9, opens: 7, signed_out_opens: 4, signup_starts: 2, signups: 1, first_photos: 1 }])).toEqual({
      sharePresses: 5, shares: 3, openLoads: 9, opens: 7, signedOutOpens: 4, signupStarts: 2, signups: 1, firstPhotos: 1,
    })
    expect(shapeShares([]).opens).toBe(0)
  })
})
