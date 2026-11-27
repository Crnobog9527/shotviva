import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { GUEST_CONTEXT, panelContext } from './panel-context'

// Comments may name what the code must not call.
const withoutComments = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

const viewer = {
  balance: { free: 6, paid: 120 }, concurrency: { limit: 2, runningIds: ['job-1'] }, favoriteIds: [],
  tier: 'pro' as const, batch: null, poolChoice: { paid: 500, promo: 0, org: 'org-1' } as never,
}

describe('the template panel signed in', () => {
  it('hands Create\'s dialog the account exactly as Create reads it', () => {
    expect(panelContext(viewer)).toEqual({ balance: viewer.balance, tier: 'pro', batch: null, concurrency: viewer.concurrency, poolChoice: viewer.poolChoice })
    // An older page read without tier, batch or pool: Starter, not an org member.
    expect(panelContext({ balance: viewer.balance, concurrency: viewer.concurrency, favoriteIds: [] })).toMatchObject({ tier: null, batch: null, poolChoice: null })
  })

  it('signed out, has nothing to spend', () => {
    expect(panelContext(null)).toBe(GUEST_CONTEXT)
  })

  // No new money path (AGENTS.md review list): the panel renders Create's own SetCreateDialog,
  // whose Generate is the workspace draft's start() (generation store → /api/generate → reserve).
  it('generates only through Create\'s dialog, with no generation or credit call of its own', () => {
    const dir = __dirname
    const sources = readdirSync(dir).filter((name) => /\.tsx?$/.test(name) && !name.includes('.test.')).map((name) => withoutComments(readFileSync(join(dir, name), 'utf8')))
    const all = sources.join('\n')
    expect(all).toContain("from '../../workspace/set-create-dialog'")
    for (const forbidden of ['/api/generate', 'enqueueJobs', 'reserveCredits', 'reserve_credits', 'job-store']) expect(all).not.toContain(forbidden)
    expect(all).not.toMatch(/(^|[^A-Za-z])fetch\(/m)
    const panel = readFileSync(join(dir, 'template-panel.tsx'), 'utf8')
    // Signed in the frame has no guest bar, so the dialog's own FormAction (Generate) shows.
    expect(panel).toMatch(/viewer \? \{\} :/)
  })
})
