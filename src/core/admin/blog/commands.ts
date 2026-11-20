import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { postInputSchema, statusInputSchema, type BlogStatus } from '@/core/blog'
import { AppError } from '@/core/errors'
import { LOCALES } from '@/core/i18n/locales'

import { afterCursor, decodeCursor, PAGE_SIZE, toPage, type Page } from '../cursor'
import { BLOG_ERRORS } from './errors'

// /admin/blog data (ARCHITECTURE §12.6). Service-role client only. A save or a status change
// is one call to its SQL function, which checks the admin, writes the row and the audit entry.

export type AdminPostRow = {
  id: string
  locale: (typeof LOCALES)[number]
  slug: string
  title: string
  status: BlogStatus
  published_at: string | null
  created_at: string
  updated_at: string
}

export type AdminPost = AdminPostRow & {
  description: string
  body_md: string
  cover_url: string | null
  cover_alt: string | null
  author_name: string
}

const rowSchema = z.object({
  id: z.string(),
  locale: z.enum(LOCALES),
  slug: z.string(),
  title: z.string(),
  status: z.enum(['draft', 'published']),
  published_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
})
const postSchema = rowSchema.extend({
  description: z.string(),
  body_md: z.string(),
  cover_url: z.string().nullable(),
  cover_alt: z.string().nullable(),
  author_name: z.string(),
})

const LIST_COLUMNS = 'id, locale, slug, title, status, published_at, created_at, updated_at'
const POST_COLUMNS = `${LIST_COLUMNS}, description, body_md, cover_url, cover_alt, author_name`

const fail = (what: string, error: { message: string }): never => {
  throw new AppError('INTERNAL', `blog_posts ${what} failed`, { cause: new Error(error.message) })
}

// Newest first; index blog_posts_created_idx.
export async function listAdminPosts(db: SupabaseClient, cursor?: string | null): Promise<Page<AdminPostRow>> {
  let query = db.from('blog_posts').select(LIST_COLUMNS).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(PAGE_SIZE + 1)
  const after = decodeCursor(cursor)
  if (after) query = query.or(afterCursor(after))
  const { data, error } = await query
  if (error) fail('list', error)
  return toPage(rowSchema.array().parse(data), (row) => row)
}

export async function getAdminPost(db: SupabaseClient, id: string): Promise<AdminPost | null> {
  if (!z.uuid().safeParse(id).success) return null
  const { data, error } = await db.from('blog_posts').select(POST_COLUMNS).eq('id', id).maybeSingle()
  if (error) fail('read', error)
  return data ? postSchema.parse(data) : null
}

export type SaveOutcome = { id: string; status: BlogStatus; locale: string; slug: string }

// Create (id null) or rewrite a post's text; the status is left as it is.
export async function savePost(db: SupabaseClient, actorId: string, input: unknown): Promise<SaveOutcome> {
  const parsed = postInputSchema.safeParse(input)
  if (!parsed.success) throw new AppError('INVALID_INPUT', BLOG_ERRORS.input)
  const post = parsed.data
  const { data, error } = await db.rpc('admin_blog_save', {
    p_actor: actorId,
    p_id: post.id,
    p_locale: post.locale,
    p_slug: post.slug,
    p_title: post.title,
    p_description: post.description,
    p_body_md: post.bodyMd,
    p_cover_url: post.coverUrl,
    p_cover_alt: post.coverUrl === null ? null : post.coverAlt,
    p_author_name: post.authorName,
  })
  if (error?.code === '23505') throw new AppError('CONFLICT', BLOG_ERRORS.slugTaken)
  if (error?.message === 'BLOG_POST_NOT_FOUND') throw new AppError('NOT_FOUND', BLOG_ERRORS.notFound)
  if (error?.message === 'BLOG_POST_EMPTY') throw new AppError('INVALID_INPUT', BLOG_ERRORS.empty)
  if (error) fail('save', error)
  const saved = z.object({ id: z.string(), status: z.enum(['draft', 'published']) }).parse(data)
  return { ...saved, locale: post.locale, slug: post.slug }
}

// Publish or take down. Returns the post's language and slug (for the revalidation).
export async function setPostStatus(db: SupabaseClient, actorId: string, input: unknown): Promise<{ locale: string; slug: string }> {
  const parsed = statusInputSchema.safeParse(input)
  if (!parsed.success) throw new AppError('INVALID_INPUT', BLOG_ERRORS.input)
  const { data, error } = await db.rpc('admin_blog_set_status', { p_actor: actorId, p_id: parsed.data.id, p_publish: parsed.data.publish })
  if (error?.message === 'BLOG_POST_NOT_FOUND') throw new AppError('NOT_FOUND', BLOG_ERRORS.notFound)
  if (error?.message === 'BLOG_POST_EMPTY') throw new AppError('INVALID_INPUT', BLOG_ERRORS.empty)
  if (error) fail('status', error)
  return z.object({ locale: z.string(), slug: z.string() }).parse(data)
}
