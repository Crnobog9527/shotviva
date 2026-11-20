import 'server-only'

import { z } from 'zod'

import { AppError } from '@/core/errors'
import type { ObjectStore } from '@/core/storage'

import {
  COVER_STILL_TYPES,
  createCoverUpload,
  maxBytesFor,
  publishStillCover,
  sniffCover,
  type CoverUploadTicket,
} from '../covers'
import { BLOG_ERRORS } from './errors'

// A post's cover goes the template covers' way (ARCHITECTURE §8.3): the browser PUTs to the
// private bucket's uploads-admin/blog/ prefix, then the server reads that object, converts it
// to WebP at the cover edge, writes covers/blog/before-<hash>.webp to the public bucket and
// hands back its address. The address goes into the post form and is saved with the post.

const STAGING_ID = 'blog'

const requestSchema = z.object({ contentType: z.string(), size: z.number().int().positive() })

export function requestBlogCoverUpload(uploads: ObjectStore, input: unknown): Promise<CoverUploadTicket> {
  const parsed = requestSchema.safeParse(input)
  if (!parsed.success) throw new AppError('INVALID_INPUT', BLOG_ERRORS.cover)
  return createCoverUpload(uploads, { templateId: STAGING_ID, purpose: 'before', ...parsed.data })
}

const stagedKey = new RegExp(`^uploads-admin/${STAGING_ID}/[0-9a-f-]{36}\\.(jpg|png|webp)$`)

export type BlogCoverDeps = { uploads: ObjectStore; assets: ObjectStore; assetsBaseUrl: string | undefined }

export async function applyBlogCover(deps: BlogCoverDeps, input: unknown): Promise<string> {
  const parsed = z.object({ key: z.string().regex(stagedKey) }).safeParse(input)
  if (!parsed.success) throw new AppError('INVALID_INPUT', BLOG_ERRORS.cover)
  if (!deps.assetsBaseUrl) throw new AppError('INTERNAL', 'NEXT_PUBLIC_ASSETS_BASE_URL is not configured')
  const { key } = parsed.data
  if (!(await deps.uploads.head(key))) throw new AppError('INVALID_INPUT', BLOG_ERRORS.cover)
  const bytes = await deps.uploads.get(key)
  const type = sniffCover(bytes)
  if (!type || !(COVER_STILL_TYPES as readonly string[]).includes(type) || bytes.length > maxBytesFor(type)) {
    throw new AppError('INVALID_INPUT', BLOG_ERRORS.cover)
  }
  const url = await publishStillCover(deps.assets, deps.assetsBaseUrl, { templateId: STAGING_ID, slot: 'before' }, bytes)
  await deps.uploads.delete(key).catch(() => undefined)
  return url
}
