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
import { BLOG_CACHE_TAG } from '@/core/blog'
import { publicEnv } from '@/core/public-env'
import { r2PublicStore, r2Store } from '@/core/storage'

// Server actions are public endpoints, so each one re-checks the admin role itself. A save or a
// status change expires the blog's cached reads (list, post pages, sitemap, llms.txt, footer
// link) at once, so the next visit renders the new state (ARCHITECTURE §12.6). updateTag, not
// revalidateTag: the first visit after a publish must not be served the old page.
function blogChanged() {
  updateTag(BLOG_CACHE_TAG)
  refresh()
}

export async function savePostAction(input: unknown): Promise<ActionValue<SaveOutcome>> {
  const admin = await requireAdmin()
  return runAdminQuery(async () => {
    const saved = await savePost(createAdminSupabase(), admin.id, input)
    blogChanged()
    return saved
  })
}

export async function setPostStatusAction(input: { id: string; publish: boolean }): Promise<ActionValue<{ locale: string; slug: string }>> {
  const admin = await requireAdmin()
  return runAdminQuery(async () => {
    const changed = await setPostStatus(createAdminSupabase(), admin.id, input)
    blogChanged()
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
