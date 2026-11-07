'use server'

import { refresh, revalidateTag } from 'next/cache'

import {
  applyCover,
  createCoverUpload,
  reorderTemplates,
  runAdminAction,
  runAdminQuery,
  saveTemplate,
  setFeaturedTemplates,
  setTemplateActive,
  setTemplatesActive,
  type ActionResult,
  type ActionValue,
  type ActiveChangeOutcome,
  type ApplyCoverRequest,
  type CoverTicket,
  type CoverUploadRequest,
  type SaveTemplatePayload,
} from '@/core/admin'
import { createAdminSupabase, requireAdmin } from '@/core/auth'
import { publicEnv } from '@/core/public-env'
import { r2PublicStore, r2Store } from '@/core/storage'
import { TEMPLATES_CACHE_TAG } from '@/core/templates'
import { CREDITS_FLOOR } from '@/modules/image'

// Server actions are public endpoints, so each one re-checks the admin role itself.

// Prices and covers show on the home page and the landing pages, so a save marks the cached
// catalogue stale (ARCHITECTURE §8.3). 'max' is stale-while-revalidate: the next visitor still
// gets the cached page at once and the fresh one is rendered behind it, instead of waiting a
// second or more for every marketing page to re-render after each admin save (performance B1).
// The tag covers every page that reads the catalogue, '/' included. The admin's own lists read
// the database directly, and refresh() re-renders them now. Charges never read this cache.
function catalogueChanged() {
  revalidateTag(TEMPLATES_CACHE_TAG, 'max')
  refresh()
}

export async function saveTemplateAction(payload: SaveTemplatePayload): Promise<ActionResult> {
  const admin = await requireAdmin()
  return runAdminAction(async () => {
    await saveTemplate(createAdminSupabase(), admin.id, payload, CREDITS_FLOOR)
    catalogueChanged()
  })
}

export async function setTemplateActiveAction(input: unknown): Promise<ActionResult> {
  const admin = await requireAdmin()
  return runAdminAction(async () => {
    await setTemplateActive(createAdminSupabase(), admin.id, input, CREDITS_FLOOR)
    catalogueChanged()
  })
}

// Bulk 上架 / 下架 (T60): the same command as the switch, one request for the whole batch.
export async function setTemplatesActiveAction(input: unknown): Promise<ActionValue<ActiveChangeOutcome>> {
  const admin = await requireAdmin()
  return runAdminQuery(async () => {
    const outcome = await setTemplatesActive(createAdminSupabase(), admin.id, input, CREDITS_FLOOR)
    if (outcome.changed.length > 0) catalogueChanged()
    return outcome
  })
}

// 首页精选 (T53): the home and landing template sections read this list.
export async function setFeaturedTemplatesAction(ids: unknown): Promise<ActionResult> {
  const admin = await requireAdmin()
  return runAdminAction(async () => {
    await setFeaturedTemplates(createAdminSupabase(), admin.id, ids)
    catalogueChanged()
  })
}

export async function reorderTemplatesAction(ids: unknown): Promise<ActionResult> {
  const admin = await requireAdmin()
  return runAdminAction(async () => {
    await reorderTemplates(createAdminSupabase(), admin.id, ids)
    catalogueChanged()
  })
}

// Step 1 of a cover upload: a presigned PUT into the private bucket's uploads-admin/ prefix.
export async function requestCoverUploadAction(input: CoverUploadRequest): Promise<ActionValue<CoverTicket>> {
  await requireAdmin()
  return runAdminQuery(() => createCoverUpload(r2Store(), input))
}

// Step 2: convert the staged file, publish it to the public bucket, point the template at it.
export async function applyCoverAction(input: ApplyCoverRequest): Promise<ActionResult> {
  await requireAdmin()
  return runAdminAction(async () => {
    const deps = {
      db: createAdminSupabase(),
      uploads: r2Store(),
      assets: r2PublicStore(),
      assetsBaseUrl: publicEnv.NEXT_PUBLIC_ASSETS_BASE_URL,
    }
    await applyCover(deps, input)
    catalogueChanged()
  })
}
