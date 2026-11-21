'use server'

import { refresh, updateTag } from 'next/cache'

import {
  applyBlogCover,
  requestBlogCoverUpload,
  runAdminQuery,
  savePost,
  setPostStatus,
  type ActionValue,
  type SaveOutcome,
} from '@/core/admin'
import { createAdminSupabase, requireAdmin } from '@/core/auth'
import { BLOG_CACHE_TAG, BLOG_FOOTER_TAG } from '@/core/blog'
import { publicEnv } from '@/core/public-env'
import { r2PublicStore, r2Store } from '@/core/storage'
import { warmPublicPagesSoon } from '@/app/warm-public-pages'

// Server actions are public endpoints, so each one re-checks the admin role itself. What the
// public sees changes only for a published post, so a draft save expires nothing (the admin
// lists read the database). A published post's text expires the blog's cached reads (list, post
// pages, sitemap, llms.txt); publishing or taking down also expires the footer link, which
// every marketing page carries (ARCHITECTURE §12.6). updateTag, not revalidateTag: the first
// visit after a publish must not be served the old page.
function blogChanged(scope: 'text' | 'status') {
  updateTag(BLOG_CACHE_TAG)
  if (scope === 'status') updateTag(BLOG_FOOTER_TAG)
  warmPublicPagesSoon()
  refresh()
}

export async function savePostAction(input: unknown): Promise<ActionValue<SaveOutcome>> {
  const admin = await requireAdmin()
  return runAdminQuery(async () => {
    const saved = await savePost(createAdminSupabase(), admin.id, input)
    if (saved.status === 'published') blogChanged('text')
    else refresh()
    return saved
  })
}

export async function setPostStatusAction(input: { id: string; publish: boolean }): Promise<ActionValue<{ locale: string; slug: string }>> {
  const admin = await requireAdmin()
  return runAdminQuery(async () => {
    const changed = await setPostStatus(createAdminSupabase(), admin.id, input)
    blogChanged('status')
    return changed
  })
}

// Step 1 of a cover upload: a presigned PUT into the private bucket's uploads-admin/blog/ prefix.
export async function requestCoverUploadAction(input: { contentType: string; size: number }) {
  await requireAdmin()
  return runAdminQuery(() => requestBlogCoverUpload(r2Store(), input))
}

// Step 2: convert the staged file and publish it; the address goes into the form, and into the
// post when the post is saved.
export async function applyCoverAction(input: { key: string }): Promise<ActionValue<string>> {
  await requireAdmin()
  return runAdminQuery(() => applyBlogCover({ uploads: r2Store(), assets: r2PublicStore(), assetsBaseUrl: publicEnv.NEXT_PUBLIC_ASSETS_BASE_URL }, input))
}
