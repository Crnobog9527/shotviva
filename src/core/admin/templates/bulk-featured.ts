import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { AppError } from '@/core/errors'
import { logger } from '@/core/logger'
import { TEMPLATE_SURFACES } from '@/core/templates/schema'

import { FEATURED_LIMIT, planBlocked, planFeaturedChange, type FeaturedPlan } from './bulk-featured-rules'
import * as repo from './repository'

// Batch 首页精选 (2026-11-12): the ticked templates in or out of the home featured list. Planned
// here against the live rows, written by the same admin_set_featured_templates call the single
// switch uses (one transaction; it re-checks "published, on the web" and the limit of 12). A
// failure or going past the limit saves nothing, like the batch edit (T79).

const id = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(64)
const unique = (ids: string[]) => new Set(ids).size === ids.length
const inputSchema = z.object({
  ids: z.array(id).min(1).max(200).refine(unique, 'ids must be unique'),
  featured: z.boolean(),
  // The featured list as the page showed it. A different list on the server means it was changed
  // elsewhere since; the batch is refused instead of being built on top of what the admin never saw.
  expectedIds: z.array(id).max(FEATURED_LIMIT).refine(unique, 'ids must be unique'),
})

const rowSchema = z.array(z.object({
  id: z.string(),
  name: z.string(),
  is_active: z.boolean(),
  visible_in: z.array(z.enum(TEMPLATE_SURFACES)),
  featured_rank: z.number().int().nullable(),
}))

// One read: the current featured rows and the ticked ones (primary key and the featured_rank filter).
async function loadRows(client: SupabaseClient, ids: readonly string[]) {
  const { data, error } = await client
    .from('templates')
    .select('id, name, is_active, visible_in, featured_rank')
    .or(`featured_rank.not.is.null,id.in.(${ids.join(',')})`)
  if (error) throw new AppError('INTERNAL', `bulk featured read failed: ${error.message}`)
  return rowSchema.parse(data)
}

const sameList = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((value, i) => value === b[i])

export async function setTemplatesFeatured(client: SupabaseClient, adminId: string, input: unknown): Promise<FeaturedPlan> {
  const parsed = inputSchema.safeParse(input)
  if (!parsed.success) throw new AppError('INVALID_INPUT', parsed.error.issues.map((issue) => issue.message).join('; '))
  const { ids, featured, expectedIds } = parsed.data
  const rows = await loadRows(client, ids)
  const current = rows
    .filter((row) => row.featured_rank !== null)
    .sort((a, b) => (a.featured_rank ?? 0) - (b.featured_rank ?? 0))
    .map((row) => row.id)
  if (!sameList(current, expectedIds)) throw new AppError('CONFLICT', '首页精选在别处改过了，请刷新页面后再试')
  const byId = new Map(rows.map((row) => [row.id, row]))
  const plan = planFeaturedChange(current, ids.map((ticked) => {
    const row = byId.get(ticked)
    return row ? { id: row.id, name: row.name, isActive: row.is_active, visibleIn: row.visible_in } : { id: ticked, name: ticked, missing: true as const }
  }), featured)
  if (planBlocked(plan) || plan.changed.length === 0) return plan
  await repo.setFeaturedTemplates(client, plan.next)
  // One line per template, like the 上架 switch and the batch edit: who put what on the home page.
  for (const template of plan.changed) logger.info('admin.template.featured_changed', { adminId, templateId: template.id, featured })
  return plan
}
