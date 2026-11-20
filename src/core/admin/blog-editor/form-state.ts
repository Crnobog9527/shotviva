import { MAX_BODY_CHARS, postInputSchema, type PostInput } from '@/core/blog/client'

import type { AdminPost } from '../blog'

// The editor's form: every field a string, so inputs stay controlled. toInput turns it into
// what the server action validates again.
export type PostForm = {
  id: string | null
  locale: 'en' | 'zh'
  slug: string
  title: string
  description: string
  bodyMd: string
  coverUrl: string
  coverAlt: string
  authorName: string
}

export const emptyForm = (authorName = 'Shotviva Team'): PostForm => ({
  id: null,
  locale: 'en',
  slug: '',
  title: '',
  description: '',
  bodyMd: '',
  coverUrl: '',
  coverAlt: '',
  authorName,
})

export const toForm = (post: AdminPost): PostForm => ({
  id: post.id,
  locale: post.locale,
  slug: post.slug,
  title: post.title,
  description: post.description,
  bodyMd: post.body_md,
  coverUrl: post.cover_url ?? '',
  coverAlt: post.cover_alt ?? '',
  authorName: post.author_name,
})

export const toInput = (form: PostForm): PostInput | null => {
  const parsed = postInputSchema.safeParse({
    ...form,
    coverUrl: form.coverUrl.trim() === '' ? null : form.coverUrl,
    coverAlt: form.coverUrl.trim() === '' || form.coverAlt.trim() === '' ? null : form.coverAlt,
  })
  return parsed.success ? parsed.data : null
}

// A suggestion for the address from an English title; the admin can edit it.
export function slugFromTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/, '')
}

export const bodyOver = (form: PostForm) => form.bodyMd.length > MAX_BODY_CHARS
