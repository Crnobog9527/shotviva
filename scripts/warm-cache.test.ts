import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { WARM_USER_AGENTS, warmPaths } from './warm-cache.mjs'

describe('warm-cache', () => {
  it('warms every page the HTML budget guards, each once', () => {
    const paths = warmPaths(readFileSync(join(process.cwd(), 'scripts/html-budget.json'), 'utf8'))
    expect(paths).toContain('/')
    expect(paths).toContain('/zh')
    expect(paths).toContain('/pricing')
    expect(new Set(paths).size).toBe(paths.length)
    expect(paths.every((path) => path.startsWith('/'))).toBe(true)
  })

  it('asks as a browser and as PageSpeed (Lighthouse)', () => {
    expect(Object.keys(WARM_USER_AGENTS)).toEqual(['browser', 'lighthouse'])
    expect(WARM_USER_AGENTS.lighthouse).toContain('Chrome-Lighthouse')
  })
})
