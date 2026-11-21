import { describe, expect, it, vi } from 'vitest'

import { llmsTxt } from '../seo/llms-txt'
import { testSite } from '../seo/test-site'
import type { BlogAuthor } from './authors'
import { authorByName } from './authors'
import { postInputSchema } from './rules'
import { articleLd, authorMetadata, blogListMetadata, postCrumbs, postMetadata, profilePageLd } from './seo'
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

const text = { jobTitle: 'Director', intro: 'Jane Doe directs.', roles: ['Lecturer'], awards: ['2021: A prize'], brands: ['Acme'] }
const jane: BlogAuthor = {
  slug: 'jane-doe',
  name: 'Jane Doe',
  photo: { src: '/blog/authors/jane.webp', width: 480, height: 600 },
  knowsAbout: ['Photography'],
  text: { en: text, zh: { ...text, jobTitle: '导演', intro: 'Jane Doe，导演。' } },
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

  it('keeps /blog/author for the authors pages', () => {
    expect(postInputSchema.safeParse({ ...valid, slug: 'author' }).success).toBe(false)
    expect(postInputSchema.safeParse({ ...valid, slug: 'author-tips' }).success).toBe(true)
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

  it('names a registered author with their page', () => {
    expect(postMetadata(site, { ...post, authorName: 'Jane Doe' }, false, [jane]).authors).toEqual([{ name: 'Jane Doe', url: 'https://example.com/blog/author/jane-doe' }])
    expect(postMetadata(site, post, false, [jane]).authors).toEqual([{ name: 'Example Team' }])
  })

  it('indexes an author page once the author has a post in its language, with hreflang once both do', () => {
    const closed = authorMetadata(site, jane, 'zh', { hasPosts: false, otherHasPosts: true })
    expect(closed.robots).toMatchObject({ index: false })
    expect(closed.alternates?.languages).toBeUndefined()
    const open = authorMetadata(site, jane, 'en', { hasPosts: true, otherHasPosts: true })
    expect(open.robots).toMatchObject({ index: true })
    expect(open.alternates?.canonical).toBe('https://example.com/blog/author/jane-doe')
    expect(open.alternates?.languages).toMatchObject({ 'x-default': 'https://example.com/blog/author/jane-doe' })
    expect(open.title).toEqual({ absolute: 'Jane Doe, Director | Example' })
    expect(open.description).toBe('Jane Doe directs.')
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
    // A team byline naming the brand is the brand, not a person.
    expect(ld.author).toEqual({ '@type': 'Organization', name: 'Example', url: 'https://example.com/' })
    expect(articleLd(site, { ...post, authorName: 'Someone Else' }).author).toEqual({ '@type': 'Person', name: 'Someone Else' })
  })

  it('makes a registered author a Person with one @id, the profile in the post language and the brand', () => {
    const ld = articleLd(site, { ...post, locale: 'zh', authorName: '  jane   DOE ' }, [jane])
    expect(ld.author).toMatchObject({
      '@type': 'Person',
      '@id': 'https://example.com/blog/author/jane-doe#person',
      name: 'Jane Doe',
      url: 'https://example.com/zh/blog/author/jane-doe',
      image: 'https://example.com/blog/authors/jane.webp',
      jobTitle: '导演',
      worksFor: { '@type': 'Organization', name: 'Example' },
    })
    expect(ld.author).not.toHaveProperty('award')
  })

  it('writes the profile page as a ProfilePage about the full Person', () => {
    const ld = profilePageLd(site, jane, 'en')
    expect(ld).toMatchObject({ '@type': 'ProfilePage', url: 'https://example.com/blog/author/jane-doe', mainEntity: { '@id': 'https://example.com/blog/author/jane-doe#person', description: 'Jane Doe directs.', award: ['2021: A prize'], knowsAbout: ['Photography'] } })
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

  it('lists an author page in each language where the author has a post', () => {
    const xml = blogSitemapXml(
      site,
      [
        { locale: 'en', slug: 'a', updatedAt: '2026-12-02T10:00:00.000Z', authorName: 'Jane Doe' },
        { locale: 'en', slug: 'b', updatedAt: '2026-12-05T10:00:00.000Z', authorName: 'Example Team' },
        { locale: 'zh', slug: 'a', updatedAt: '2026-12-01T10:00:00.000Z', authorName: 'Example Team' },
      ],
      [jane],
    )
    expect(xml).toContain('<loc>https://example.com/blog/author/jane-doe</loc><lastmod>2026-12-02</lastmod>')
    expect(xml).not.toContain('/zh/blog/author/')
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

describe('authors', () => {
  it('matches a byline to a registered author ignoring case and spacing, nothing else', () => {
    expect(authorByName([jane], 'jane doe')?.slug).toBe('jane-doe')
    expect(authorByName([jane], 'Jane')).toBeNull()
  })
})
