import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { cacheLife, cacheTag } from 'next/cache'
import { z } from 'zod'

import { createAdminSupabase } from '../auth/supabase-admin'
import { FAILED_READ_LIFE } from '../cache-life'
import { LOCALES, type Locale } from '../i18n/locales'
import { logger } from '../logger'
import { BLOG_CACHE_TAG, BLOG_FOOTER_TAG, type Post, type PostSummary } from './rules'

// The public blog's reads (AGENTS §5.1 items 5 and 6): published rows only, the columns a page
// needs, cached under the blog tag that every admin write expires. No cookies in a cache, so
// they read with the service role and keep the filter RLS would apply (status = published).
// The list is the newest 100: v1 holds a few dozen posts; page it when it nears that.

export const BLOG_LIFE = { revalidate: 3600, expire: 86_400 } as const
export const LIST_LIMIT = 100
const SITEMAP_LIMIT = 5000

const SUMMARY = 'id, locale, slug, title, description, cover_url, cover_alt, author_name, published_at, updated_at'

const rowSchema = z.object({
  id: z.string(),
  locale: z.enum(LOCALES),
  slug: z.string(),
  title: z.string(),
  description: z.string(),
  cover_url: z.string().nullable(),
  cover_alt: z.string().nullable(),
  author_name: z.string(),
  published_at: z.string(),
  updated_at: z.string(),
})
const fullSchema = rowSchema.extend({ body_md: z.string() })

const toSummary = (row: z.infer<typeof rowSchema>): PostSummary => ({
  id: row.id,
  locale: row.locale,
  slug: row.slug,
  title: row.title,
  description: row.description,
  coverUrl: row.cover_url,
  coverAlt: row.cover_alt,
  authorName: row.author_name,
  publishedAt: row.published_at,
  updatedAt: row.updated_at,
})

type Db = Pick<SupabaseClient, 'from'>

// Newest first; index blog_posts_published_idx (locale, published_at desc, id desc).
export async function readPublishedPosts(db: Db, locale: Locale, limit = LIST_LIMIT): Promise<PostSummary[]> {
  const { data, error } = await db
    .from('blog_posts')
    .select(SUMMARY)
    .eq('status', 'published')
    .eq('locale', locale)
    .order('published_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit)
  if (error) throw new Error(`blog_posts list failed: ${error.message}`)
  return rowSchema.array().parse(data).map(toSummary)
}

// One post by its address; unique (locale, slug). null when there is none or it is a draft.
export async function readPublishedPost(db: Db, locale: Locale, slug: string): Promise<Post | null> {
  const { data, error } = await db
    .from('blog_posts')
    .select(`${SUMMARY}, body_md`)
    .eq('status', 'published')
    .eq('locale', locale)
    .eq('slug', slug)
    .maybeSingle()
  if (error) throw new Error(`blog_posts read failed: ${error.message}`)
  if (!data) return null
  const row = fullSchema.parse(data)
  return { ...toSummary(row), bodyMd: row.body_md }
}

// Every published post's address and last edit, both languages, for the sitemap.
export async function readSitemapPosts(db: Db): Promise<Pick<PostSummary, 'locale' | 'slug' | 'updatedAt' | 'authorName'>[]> {
  const { data, error } = await db
    .from('blog_posts')
    .select('locale, slug, updated_at, author_name')
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .limit(SITEMAP_LIMIT)
  if (error) throw new Error(`blog_posts sitemap read failed: ${error.message}`)
  return z
    .object({ locale: z.enum(LOCALES), slug: z.string(), updated_at: z.string(), author_name: z.string() })
    .array()
    .parse(data)
    .map((row) => ({ locale: row.locale, slug: row.slug, updatedAt: row.updated_at, authorName: row.author_name }))
}

// A failed read (a build without the table, an outage) is kept only a minute, so pages heal.
async function orFallback<T>(read: () => Promise<T>, fallback: T): Promise<T> {
  try {
    const value = await read()
    cacheLife(BLOG_LIFE)
    return value
  } catch (error) {
    cacheLife(FAILED_READ_LIFE)
    logger.error('blog.read_failed', { error })
    return fallback
  }
}

export async function cachedPublishedPosts(locale: Locale): Promise<PostSummary[]> {
  'use cache'
  cacheTag(BLOG_CACHE_TAG)
  return orFallback(() => readPublishedPosts(createAdminSupabase(), locale), [])
}

export async function cachedPublishedPost(locale: Locale, slug: string): Promise<Post | null> {
  'use cache'
  cacheTag(BLOG_CACHE_TAG)
  return orFallback(() => readPublishedPost(createAdminSupabase(), locale, slug), null)
}

// For the footer link on every marketing page: only whether the language has a published post.
export async function cachedHasPublishedPosts(locale: Locale): Promise<boolean> {
  'use cache'
  cacheTag(BLOG_FOOTER_TAG)
  return orFallback(async () => (await readPublishedPosts(createAdminSupabase(), locale, 1)).length > 0, false)
}

export async function cachedSitemapPosts(): Promise<Pick<PostSummary, 'locale' | 'slug' | 'updatedAt' | 'authorName'>[]> {
  'use cache'
  cacheTag(BLOG_CACHE_TAG)
  return orFallback(() => readSitemapPosts(createAdminSupabase()), [])
}
