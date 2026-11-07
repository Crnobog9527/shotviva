import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { AppError } from '@/core/errors'
import { logger } from '@/core/logger'
import { creditsBelowFloor, promptInputSchema, templateInputSchema, type CreditsFloor } from '@/core/templates'

import * as repo from './repository'
import type { SaveTemplatePayload } from './types'

// Validation and business rules for the admin page. Callers pass a service-role client and
// the admin's id, after requireAdmin(); the repository never sees unvalidated input.

function parseOrThrow<T>(schema: z.ZodType<T>, value: unknown, what: string): T {
  const result = schema.safeParse(value)
  if (!result.success) {
    const detail = result.error.issues
      .map((issue) => `${issue.path.join('.') || what}: ${issue.message}`)
      .join('; ')
    throw new AppError('INVALID_INPUT', detail)
  }
  return result.data
}

const TIER_LABEL = { '1k': 'Standard', '2k': 'HD', '3k': 'Max' } as const

// ARCHITECTURE §6.1: prices may go up, never below the floor for the template's quality tier.
function assertAboveFloor(template: z.infer<typeof templateInputSchema>, floor: CreditsFloor): void {
  const low = creditsBelowFloor(template.quality, template.creditsCost, floor)
  if (low.length === 0) return
  const detail = low.map((v) => `${TIER_LABEL[v.resolution]} 不能低于 ${v.floor}（填了 ${v.given}）`).join('；')
  throw new AppError('INVALID_INPUT', `积分低于下限：${detail}`)
}

// `floor` is the image module's floor table (modules/image/credits-floor.ts); core cannot
// import a module, so the server action passes it in.
export async function saveTemplate(
  client: SupabaseClient,
  adminId: string,
  payload: SaveTemplatePayload,
  floor: CreditsFloor,
): Promise<void> {
  const template = parseOrThrow(templateInputSchema, payload.template, 'template')
  const prompt = parseOrThrow(promptInputSchema, payload.prompt, 'prompt')
  assertAboveFloor(template, floor)
  const exists = await repo.templateExists(client, template.id)
  if (payload.isNew && exists) {
    throw new AppError('INVALID_INPUT', `id "${template.id}" is already taken`)
  }
  if (!payload.isNew && !exists) throw new AppError('NOT_FOUND', `template ${template.id} not found`)
  // A brand-new template starts unpublished so it can be checked before anyone sees it.
  const toSave = payload.isNew ? { ...template, isActive: false } : template
  await repo.upsertTemplate(client, toSave, prompt)
  logger.info('admin.template.saved', { adminId, templateId: template.id, isNew: payload.isNew })
}

const setActiveSchema = z.object({
  id: z.string().min(1).max(64),
  active: z.boolean(),
  reason: z.string().trim().max(500).optional(),
})

export async function setTemplateActive(
  client: SupabaseClient,
  adminId: string,
  input: unknown,
): Promise<void> {
  const { id, active, reason } = parseOrThrow(setActiveSchema, input, 'input')
  // Unpublishing is a dangerous operation (DESIGN §7): it needs a stated reason.
  if (!active && !reason) throw new AppError('INVALID_INPUT', 'a reason is required to unpublish')
  await repo.setTemplateActive(client, id, active)
  logger.info('admin.template.active_changed', { adminId, templateId: id, active, reason })
}

const reorderSchema = z
  .array(z.string().min(1).max(64))
  .min(1)
  .max(500)
  .refine((ids) => new Set(ids).size === ids.length, 'ids must be unique')

export async function reorderTemplates(
  client: SupabaseClient,
  adminId: string,
  input: unknown,
): Promise<void> {
  const ids = parseOrThrow(reorderSchema, input, 'ids')
  await repo.reorderTemplates(client, ids)
  logger.info('admin.template.reordered', { adminId, count: ids.length })
}

// The home featured list (T53, ARCHITECTURE §12): ids in display order, at most 12, published
// web templates only (the SQL function enforces the last rule against the live rows).
export const FEATURED_MAX = 12
const featuredSchema = z
  .array(z.string().min(1).max(64))
  .max(FEATURED_MAX)
  .refine((ids) => new Set(ids).size === ids.length, 'ids must be unique')

export async function setFeaturedTemplates(client: SupabaseClient, adminId: string, input: unknown): Promise<void> {
  const ids = parseOrThrow(featuredSchema, input, 'ids')
  await repo.setFeaturedTemplates(client, ids)
  logger.info('admin.template.featured', { adminId, count: ids.length })
}
