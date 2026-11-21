import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { PUBLIC_WARM_PATHS } from './warm-pages'

describe('PUBLIC_WARM_PATHS', () => {
  it('are the pages the HTML budget (and the post-deploy warm) covers', () => {
    const budget = JSON.parse(readFileSync(join(process.cwd(), 'scripts/html-budget.json'), 'utf8')) as { profiles: Record<string, Record<string, unknown>> }
    const budgeted = new Set(Object.values(budget.profiles).flatMap((profile) => Object.keys(profile)))
    expect([...PUBLIC_WARM_PATHS].sort()).toEqual([...budgeted].sort())
  })
})
