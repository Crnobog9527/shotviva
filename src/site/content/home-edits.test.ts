import { existsSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { homePage } from './home'
import { zhHomePage } from './zh/home'

// The home page's text-edit cases (Owner 2026-11-11): its own pictures, not the image-to-image
// page's, each a /cases file of at most 150 KB with an alt text that says what it is.
describe('home text-edit cases', () => {
  it.each([
    ['en', homePage],
    ['zh', zhHomePage],
  ])('%s: four pairs of the home page’s own pictures', (_locale, page) => {
    const items = page.edits?.items ?? []
    expect(items).toHaveLength(4)
    for (const item of items) {
      for (const image of [item.before, item.after]) {
        expect(image.src).toMatch(/^\/cases\/text-[a-z0-9-]+\.webp$/)
        expect(image.alt).toMatch(/^(AI example: |AI 示例：|Example phone photo: |示例手机照：)/)
        const file = join(process.cwd(), 'public', image.src)
        expect(existsSync(file)).toBe(true)
        expect(statSync(file).size).toBeLessThanOrEqual(150_000)
      }
    }
  })
})
