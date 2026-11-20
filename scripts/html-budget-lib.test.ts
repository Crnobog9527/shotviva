import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

import { describe, expect, it } from 'vitest'

import { isOver, measure, profileOf, report, type Budget } from './html-budget-lib'

const budget: Budget = JSON.parse(readFileSync(join(__dirname, 'html-budget.json'), 'utf8'))

describe('html budget', () => {
  it('measures the bytes as served and as gzip compresses them', () => {
    const html = Buffer.from('<html>'.padEnd(5000, 'a'))
    const row = measure('/', html, { raw: 5000, gzip: 1000 })
    expect(row.raw).toBe(5000)
    expect(row.gzip).toBe(gzipSync(html, { level: 9 }).length)
    expect(isOver(row)).toBe(false)
  })

  it('fails a page over either limit, and says which in the table', () => {
    const html = Buffer.from('x'.repeat(2048))
    const raw = measure('/zh', html, { raw: 1024, gzip: 10_000 })
    const gzip = measure('/', html, { raw: 10_000, gzip: 1 })
    expect(isOver(raw)).toBe(true)
    expect(isOver(gzip)).toBe(true)
    expect(report([raw])).toMatch(/^OVER \/zh/)
  })

  it('covers the home and landing pages Bing flagged, in both profiles', () => {
    for (const name of ['build', 'live']) {
      const pages = Object.keys(profileOf(budget, name))
      expect(pages).toEqual(expect.arrayContaining(['/', '/zh', '/ai-restaurant-menu']))
      for (const limit of Object.values(profileOf(budget, name))) expect(limit.gzip).toBeLessThan(limit.raw)
    }
    expect(() => profileOf(budget, 'missing')).toThrow()
  })
})
