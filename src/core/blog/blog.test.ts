import { describe, expect, it, vi } from 'vitest'

import { llmsTxt } from '../seo/llms-txt'
import { testSite } from '../seo/test-site'
import { postInputSchema } from './rules'
import { articleLd, blogListMetadata, postCrumbs, postMetadata } from './seo'
import { blogSitemapXml } from './sitemap'
import type { Post } from './rules'

// The open site (SITE_INDEXING=on); the closed state is checked in the last describe.
const gate = vi.hoisted(() => ({ open: true }))
vi.mock('../seo/indexing-now', () => ({ indexingOpenNow: () => gate.open }))

const site = testSite()
const post: Post = {
  id: '11111111-1111-4111-8111-111111111111',
  locale: 'en',
  slug: 'best-tools',
  title: 'Best tools',
  description: 'A comparison',
  coverUrl: 'https://example.com/assets/covers/blog/before-abc.webp',
  coverAlt: 'A plated dish',
  authorName: 'Example Team',
  publishedAt: '2026-11-30T09:00:00.000Z',
  updatedAt: '2026-12-02T10:00:00.000Z',
  bodyMd: '## One',
}

describe('postInputSchema', () => {
  const valid = { id: null, locale: 'en', slug: 'best-tools', title: 'T', description: 'D', bodyMd: '', coverUrl: null, coverAlt: null, authorName: 'A' }

  it('accepts a minimal post and trims the text', () => {
    expect(postInputSchema.parse({ ...valid, title: '  Hello  ' }).title).toBe('Hello')
  })

  it.each(['Best Tools', 'best_tools', '-best', 'best--tools', '最好', ''])('refuses the address %j', (slug) => {
    expect(postInputSchema.safeParse({ ...valid, slug }).success).toBe(false)
  })

  it('needs alt text with a cover, and an https cover address', () => {
    expect(postInputSchema.safeParse({ ...valid, coverUrl: 'https://example.com/a.webp', coverAlt: null }).success).toBe(false)
    expect(postInputSchema.safeParse({ ...valid, coverUrl: 'https://example.com/a.webp', coverAlt: 'x' }).success).toBe(true)
    expect(postInputSchema.safeParse({ ...valid, coverUrl: 'javascript:alert(1)', coverAlt: 'x' }).success).toBe(false)
    expect(postInputSchema.safeParse({ ...valid, coverUrl: 'http://example.com/a.webp', coverAlt: 'x' }).success).toBe(false)
  })

  it('refuses a language the site does not have and a body over the limit', () => {
    expect(postInputSchema.safeParse({ ...valid, locale: 'fr' }).success).toBe(false)
    expect(postInputSchema.safeParse({ ...valid, bodyMd: 'x'.repeat(200_001) }).success).toBe(false)
  })
})

describe('post metadata', () => {
  it('is indexable with its own canonical and no hreflang while only one language exists', () => {
    const meta = postMetadata(site, post, false)
    expect(meta.alternates?.canonical).toBe('https://example.com/blog/best-tools')
    expect(meta.alternates?.languages).toBeUndefined()
    expect(meta.robots).toMatchObject({ index: true })
    expect(meta.title).toEqual({ absolute: 'Best tools | Example' })
  })

  it('declares hreflang both ways only when the other language has the post', () => {
    const zh = postMetadata(site, { ...post, locale: 'zh' }, true)
    expect(zh.alternates?.canonical).toBe('https://example.com/zh/blog/best-tools')
    expect(zh.alternates?.languages).toEqual({
      'zh-Hans': 'https://example.com/zh/blog/best-tools',
      en: 'https://example.com/blog/best-tools',
      'x-default': 'https://example.com/blog/best-tools',
    })
  })

  it('falls back to the site share card without a cover', () => {
    const meta = postMetadata(site, { ...post, coverUrl: null, coverAlt: null }, false)
    expect(JSON.stringify(meta.openGraph)).toContain('https://example.com/og.jpg')
  })

  it('is noindex while the pre-launch switch is closed', () => {
    gate.open = false
    try {
      expect(postMetadata(site, post, false).robots).toMatchObject({ index: false })
      expect(blogListMetadata(site, 'en', { title: 'Blog', description: 'd' }, { hasPosts: true, otherHasPosts: false }).robots).toMatchObject({ index: false })
    } finally {
      gate.open = true
    }
  })

  it('keeps the list noindex until the language has a post', () => {
    expect(blogListMetadata(site, 'en', { title: 'Blog', description: 'd' }, { hasPosts: false, otherHasPosts: false }).robots).toMatchObject({ index: false })
    expect(blogListMetadata(site, 'en', { title: 'Blog', description: 'd' }, { hasPosts: true, otherHasPosts: false }).robots).toMatchObject({ index: true })
  })
})

describe('structured data', () => {
  it('writes an Article with the dates the page shows', () => {
    const ld = articleLd(site, post)
    expect(ld).toMatchObject({ '@type': 'Article', headline: 'Best tools', datePublished: post.publishedAt, dateModified: post.updatedAt, inLanguage: 'en' })
    expect(ld.author).toEqual({ '@type': 'Person', name: 'Example Team' })
  })

  it('builds Home > Blog > post in the post language', () => {
    expect(postCrumbs({ ...post, locale: 'zh' }, { home: '首页', blog: '博客' }).map((crumb) => crumb.path)).toEqual(['/zh', '/zh/blog', '/zh/blog/best-tools'])
  })
})

describe('blog sitemap', () => {
  it('lists posts and a list page per language with the day of the last edit', () => {
    const xml = blogSitemapXml(site, [
      { locale: 'en', slug: 'a', updatedAt: '2026-12-02T10:00:00.000Z' },
      { locale: 'en', slug: 'b', updatedAt: '2026-12-05T10:00:00.000Z' },
      { locale: 'zh', slug: 'a', updatedAt: '2026-12-01T10:00:00.000Z' },
    ])
    expect(xml).toContain('<loc>https://example.com/blog</loc><lastmod>2026-12-05</lastmod>')
    expect(xml).toContain('<loc>https://example.com/blog/a</loc><lastmod>2026-12-02</lastmod>')
    expect(xml).toContain('<loc>https://example.com/zh/blog</loc><lastmod>2026-12-01</lastmod>')
    expect(xml).toContain('<loc>https://example.com/zh/blog/a</loc><lastmod>2026-12-01</lastmod>')
  })

  it('is an empty urlset with no post', () => {
    expect(blogSitemapXml(site, [])).not.toContain('<url>')
  })
})

describe('llms.txt', () => {
  it('lists published posts under their own heading, each at its language address', () => {
    const text = llmsTxt(site, 'Summary.', [], [
      { path: '/blog/best-tools', title: 'Best tools', description: 'A comparison', locale: 'en' },
      { path: '/blog/best-tools', title: '最佳工具', description: '对比', locale: 'zh' },
    ])
    expect(text).toContain('## Blog')
    expect(text).toContain('- [Best tools](https://example.com/blog/best-tools): A comparison')
    expect(text).toContain('- [最佳工具](https://example.com/zh/blog/best-tools): 对比')
  })

  it('has no Blog heading without posts', () => {
    expect(llmsTxt(site, 'Summary.', [])).not.toContain('## Blog')
  })
})
