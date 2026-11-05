import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { pagePath, validateContentPage } from '@/core/content'

import { site } from '../site.config'
import { contentPages, homePage } from './index'

const allPages = [homePage, ...contentPages]

// The keyword map CSV is the single source of indexable pages (AGENTS §9).
function csvUrls(): string[] {
  const csv = readFileSync(join(process.cwd(), 'seo资料', 'Shotviva 页面与主词映射（美国口径）.csv'), 'utf8')
  return csv
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.split(',')[1])
    .filter((url): url is string => Boolean(url?.startsWith('/')))
}

describe('site content', () => {
  it.each(allPages.map((p) => [pagePath(p), p] as const))('%s passes the TDK / G1 rules', (_, page) => {
    expect(validateContentPage(page)).toEqual([])
  })

  it('gives every page its own keyword (R1)', () => {
    const keywords = allPages.map((p) => p.keyword.toLowerCase())
    expect(new Set(keywords).size).toBe(keywords.length)
  })

  it('only indexes pages that are in the keyword map CSV', () => {
    const urls = csvUrls()
    for (const path of site.indexing.indexablePaths) expect(urls).toContain(path)
  })

  it('lists every content page as indexable and links only to existing pages', () => {
    const known = new Set([...allPages.map(pagePath), '/pricing'])
    for (const page of allPages) {
      expect(site.indexing.indexablePaths).toContain(pagePath(page))
      for (const link of page.related) expect(known).toContain(link.href)
    }
  })

  it('links home with the R8 anchor text from inner pages', () => {
    for (const page of contentPages) {
      const home = page.related.find((link) => link.href === '/')
      expect(home?.anchor).toMatch(/^(AI image to image|img to img)$/)
    }
  })

  it('links every inner page from the home page (R8)', () => {
    const hrefs = homePage.related.map((link) => link.href)
    for (const page of contentPages) expect(hrefs).toContain(pagePath(page))
  })
})
