'use server'

import { refresh, updateTag } from 'next/cache'

import { deleteTemplates, runAdminQuery, setTemplatesSale, type ActionValue, type BulkTaskOutcome } from '@/core/admin'
import { setTemplatesSeries } from '@/core/admin/template-series'
import { createAdminSupabase, requireAdmin } from '@/core/auth'
import { TEMPLATES_CACHE_TAG } from '@/core/templates'

// The template list's further batch actions (Owner 2026-11-14). Each re-checks the admin role and
// runs every ticked template through that template's own audited path; see core/admin/templates/bulk-tasks.ts.

// 批量删除: unpublished templates are on no public page, so only the admin list re-renders.
export async function deleteTemplatesAction(input: unknown): Promise<ActionValue<BulkTaskOutcome>> {
  const admin = await requireAdmin()
  return runAdminQuery(async () => {
    const outcome = await deleteTemplates(createAdminSupabase(), admin.id, input)
    refresh()
    return outcome
  })
}

// 批量开放 / 停止售卖: decides whether the catalogue lists them, like the single switch.
export async function setTemplatesSaleAction(input: unknown): Promise<ActionValue<BulkTaskOutcome>> {
  const admin = await requireAdmin()
  return runAdminQuery(async () => {
    const outcome = await setTemplatesSale(createAdminSupabase(), admin.id, input)
    updateTag(TEMPLATES_CACHE_TAG)
    refresh()
    return outcome
  })
}

// 批量加入 / 移出系列: series panels show on the public catalogue.
export async function setTemplatesSeriesAction(input: unknown): Promise<ActionValue<BulkTaskOutcome>> {
  const admin = await requireAdmin()
  return runAdminQuery(async () => {
    const outcome = await setTemplatesSeries(createAdminSupabase(), admin.id, input)
    updateTag(TEMPLATES_CACHE_TAG)
    refresh()
    return outcome
  })
}
