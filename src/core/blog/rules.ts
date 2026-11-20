import { z } from 'zod'

import { LOCALES } from '../i18n/locales'

// The blog's data rules (ARCHITECTURE §12.6), shared by the admin editor (browser checks), the
// admin commands and the public reads. Client-safe: no server-only imports. The database
// repeats the shape checks (1600_blog_posts.sql).

export const BLOG_STATUSES = ['draft', 'published'] as const
export type BlogStatus = (typeof BLOG_STATUSES)[number]

export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/
export const MAX_BODY_CHARS = 200_000

// Cache tag every blog read carries; every admin write expires it.
export const BLOG_CACHE_TAG = 'blog'
// The footer's "has this language a post" read: expires only when a post is published or taken
// down, so saving text does not re-render every marketing page.
export const BLOG_FOOTER_TAG = 'blog-footer'

// What the admin form sends. The cover is an https address in our public assets bucket with its
// alt text; the text fields are trimmed here so the database never stores padding.
export const postInputSchema = z
  .object({
    id: z.uuid().nullable(),
    locale: z.enum(LOCALES),
    slug: z.string().trim().min(1).max(100).regex(SLUG_PATTERN),
    title: z.string().trim().min(1).max(160),
    description: z.string().trim().min(1).max(320),
    bodyMd: z.string().max(MAX_BODY_CHARS),
    coverUrl: z.string().trim().max(500).regex(/^https:\/\/[^\s/?#@]+\/\S*$/).nullable(),
    coverAlt: z.string().trim().max(200).nullable(),
    authorName: z.string().trim().min(1).max(80),
  })
  .refine((post) => post.coverUrl === null || (post.coverAlt ?? '').length > 0, { message: 'cover_alt', path: ['coverAlt'] })

export type PostInput = z.infer<typeof postInputSchema>

export const statusInputSchema = z.object({ id: z.uuid(), publish: z.boolean() })

// A published post as the public pages read it. `bodyMd` is only on the full read.
export type PostSummary = {
  id: string
  locale: (typeof LOCALES)[number]
  slug: string
  title: string
  description: string
  coverUrl: string | null
  coverAlt: string | null
  authorName: string
  publishedAt: string
  updatedAt: string
}
export type Post = PostSummary & { bodyMd: string }

// The address path of a post, without the /zh prefix.
export const postPath = (slug: string) => `/blog/${slug}`
export const BLOG_PATH = '/blog'
