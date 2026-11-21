import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { SLUG_PATTERN } from '@/core/blog/rules'
import { LOCALES } from '@/core/i18n/locales'

import { BLOG_AUTHORS } from './blog-authors'

describe('blog authors', () => {
  it.each(BLOG_AUTHORS.map((author) => [author.slug, author] as const))('%s has a usable page in every language', (_, author) => {
    expect(author.slug).toMatch(SLUG_PATTERN)
    expect(existsSync(join(process.cwd(), 'public', author.photo.src))).toBe(true)
    for (const locale of LOCALES) {
      const text = author.text[locale]
      // The intro is the page's meta description (建站规格 R3).
      expect(text.intro.length).toBeLessThanOrEqual(155)
      expect(text.intro).toContain(author.name)
      // The page title (authorMetadata): the brand is added only when the job title lacks it.
      const title = `${author.name}, ${text.jobTitle}`
      expect((title.includes('Shotviva') ? title : `${title} | Shotviva`).length).toBeLessThanOrEqual(60)
      expect(text.roles.length * text.awards.length * text.brands.length).toBeGreaterThan(0)
    }
  })

  it('has unique slugs and names', () => {
    expect(new Set(BLOG_AUTHORS.map((author) => author.slug)).size).toBe(BLOG_AUTHORS.length)
    expect(new Set(BLOG_AUTHORS.map((author) => author.name.toLowerCase())).size).toBe(BLOG_AUTHORS.length)
  })
})
