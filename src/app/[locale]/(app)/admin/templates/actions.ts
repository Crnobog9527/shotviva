'use server'

import { refresh, updateTag } from 'next/cache'

import {
  applyCover,
  bulkEditTemplates,
  createCoverUpload,
  deleteTemplate,
  deleteTemplateCategory,
  reorderTemplateCategories,
  saveTemplateCategory,
  runAdminAction,
  runAdminQuery,
  saveTemplate,
  setFeaturedTemplates,
  setTemplatesFeatured,
  setTemplateActive,
  setTemplateOrder,
  setTemplatesActive,
  type ActionResult,
  type ActionValue,
  type ActiveChangeOutcome,
  type ApplyCoverRequest,
  type BulkEditOutcome,
  type CoverTicket,
  type CoverUploadRequest,
  type FeaturedPlan,
  type SaveTemplatePayload,
} from '@/core/admin'
import { createAdminSupabase, requireAdmin } from '@/core/auth'
import { publicEnv } from '@/core/public-env'
import { r2PublicStore, r2Store } from '@/core/storage'
import { TEMPLATES_CACHE_TAG } from '@/core/templates'
import { readTemplateFloors } from '@/site/template-pricing'

// Server actions are public endpoints, so each one re-checks the admin role itself.

// Prices, covers and the 首页精选 order show on the home page and the landing pages (both
// languages), so a save expires the cached catalogue at once (ARCHITECTURE §8.3). updateTag, not
// revalidateTag(…, 'max'): with stale-while-revalidate the first load after a save still showed
// the old order and only a later one the new (Owner 2026-11-12); now the next request waits for
// the fresh page. Admin saves are rare, so the one slower render per page is the cheaper side.
// The tag covers every page that reads the catalogue, '/' and '/zh' included. The admin's own
// lists read the database directly, and refresh() re-renders them now. Charges never read this cache.
function catalogueChanged() {
  updateTag(TEMPLATES_CACHE_TAG)
  refresh()
}

export async function saveTemplateAction(payload: SaveTemplatePayload): Promise<ActionResult> {
  const admin = await requireAdmin()
  const result = await runAdminQuery(async () => {
    const db = createAdminSupabase()
    const version = await saveTemplate(db, admin.id, payload, await readTemplateFloors(db))
    catalogueChanged()
    return version
  })
  return result.ok ? { ok: true, version: result.value } : result
}

export async function setTemplateActiveAction(input: unknown): Promise<ActionResult> {
  const admin = await requireAdmin()
  return runAdminAction(async () => {
    const db = createAdminSupabase()
    await setTemplateActive(db, admin.id, input, await readTemplateFloors(db))
    catalogueChanged()
  })
}

// Bulk 上架 / 下架 (T60): the same command as the switch, one request for the whole batch.
export async function setTemplatesActiveAction(input: unknown): Promise<ActionValue<ActiveChangeOutcome>> {
  const admin = await requireAdmin()
  return runAdminQuery(async () => {
    const db = createAdminSupabase()
    const outcome = await setTemplatesActive(db, admin.id, input, await readTemplateFloors(db))
    if (outcome.changed.length > 0) catalogueChanged()
    return outcome
  })
}

// Batch edit (T79): one call for the ticked templates; a refusal lists the templates that fail
// and changes nothing.
export async function bulkEditTemplatesAction(input: unknown): Promise<ActionValue<BulkEditOutcome>> {
  const admin = await requireAdmin()
  return runAdminQuery(async () => {
    const db = createAdminSupabase()
    const outcome = await bulkEditTemplates(db, admin.id, input, await readTemplateFloors(db))
    if (outcome.changed > 0) catalogueChanged()
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

// Batch 首页精选 (2026-11-12): the ticked templates in or out; a refusal lists them and saves nothing.
export async function setTemplatesFeaturedAction(input: unknown): Promise<ActionValue<FeaturedPlan>> {
  const admin = await requireAdmin()
  return runAdminQuery(async () => {
    const plan = await setTemplatesFeatured(createAdminSupabase(), admin.id, input)
    if (plan.changed.length > 0 && plan.failures.length === 0 && plan.over === 0) catalogueChanged()
    return plan
  })
}

// Drag-to-reorder and the arrows (T76): one group's whole order per call.
export async function setTemplateOrderAction(input: unknown): Promise<ActionResult> {
  const admin = await requireAdmin()
  return runAdminAction(async () => {
    await setTemplateOrder(createAdminSupabase(), admin.id, input)
    catalogueChanged()
  })
}

// 分类管理 (T75): names, intros, card style and order show on every catalogue page; a delete
// also moves templates, so all three expire the catalogue like a template save.
export async function saveTemplateCategoryAction(payload: unknown): Promise<ActionResult> {
  const admin = await requireAdmin()
  return runAdminAction(async () => {
    await saveTemplateCategory(createAdminSupabase(), admin.id, payload)
    catalogueChanged()
  })
}

export async function reorderTemplateCategoriesAction(keys: unknown): Promise<ActionResult> {
  const admin = await requireAdmin()
  return runAdminAction(async () => {
    await reorderTemplateCategories(createAdminSupabase(), admin.id, keys)
    catalogueChanged()
  })
}

export async function deleteTemplateCategoryAction(payload: unknown): Promise<ActionValue<{ moved: number }>> {
  const admin = await requireAdmin()
  return runAdminQuery(async () => {
    const outcome = await deleteTemplateCategory(createAdminSupabase(), admin.id, payload)
    catalogueChanged()
    return outcome
  })
}

// Step 1 of a cover upload: a presigned PUT into the private bucket's uploads-admin/ prefix.
export async function requestCoverUploadAction(input: CoverUploadRequest): Promise<ActionValue<CoverTicket>> {
  await requireAdmin()
  return runAdminQuery(() => createCoverUpload(r2Store(), input))
}

// Step 2: convert the staged file, publish it to the public bucket, point the template at it.
export async function applyCoverAction(input: ApplyCoverRequest): Promise<ActionResult> {
  const admin = await requireAdmin()
  return runAdminAction(async () => {
    const deps = {
      actorId: admin.id,
      db: createAdminSupabase(),
      uploads: r2Store(),
      assets: r2PublicStore(),
      assetsBaseUrl: publicEnv.NEXT_PUBLIC_ASSETS_BASE_URL,
    }
    await applyCover(deps, input)
    catalogueChanged()
  })
}

// 删除 an unpublished template (Owner 2026-11-13). Unpublished templates are on no public page, so
// only the admin list re-renders.
export async function deleteTemplateAction(input: { id: string }): Promise<ActionResult> {
  const admin = await requireAdmin()
  return runAdminAction(async () => {
    await deleteTemplate(createAdminSupabase(), admin.id, input)
    refresh()
  })
}
