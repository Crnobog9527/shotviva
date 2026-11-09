import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { STYLE_STANDARD_CREDITS } from '@/core/templates/pricing'
import { AppError } from '@/core/errors'
import { isStyleRefKey } from '@/core/templates/style-refs'
import { logger } from '@/core/logger'
import { MISSING_COST, providerFloor, floorGuidance, type ProviderFloors } from '@/core/templates/provider-pricing'
import { creditsBelowFloor, promptInputSchema, templateInputSchema, toggleSetupProblems, type PromptInput } from '@/core/templates'

import { describeBlockers, planActiveChange, type ActiveChangeOutcome } from './publish-rules'
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
function assertAboveFloor(template: z.infer<typeof templateInputSchema>, floor: ProviderFloors): void {
  if (floor.styleDraft && template.creditsCost['1k'] !== STYLE_STANDARD_CREDITS)
    throw new AppError('INVALID_INPUT', `画风草稿 Standard 规划收费为 ${STYLE_STANDARD_CREDITS} 积分`)
  const low = creditsBelowFloor(template.quality, template.creditsCost, floor)
  if (low.length === 0) return
  const detail = low.map((v) => v.floor === MISSING_COST ? floorGuidance(v.floor, floor.unknownCapabilities) : `${TIER_LABEL[v.resolution]} 不能低于 ${v.floor}（填了 ${v.given}）`).join('；')
  throw new AppError('INVALID_INPUT', `积分低于下限：${detail}`)
}

// T89: a toggle needs its {{key}} in the prompt body and both private fragments, or what the
// user picks would never reach the model.
function assertTogglesWired(template: z.infer<typeof templateInputSchema>, prompt: PromptInput): void {
  const problems = toggleSetupProblems(template.fields.toggles, prompt.body, prompt.modelParams)
  if (problems.length > 0) throw new AppError('INVALID_INPUT', `开关没接好：${problems.join('；')}`)
}

// `floor` is the image module's floor table (modules/image/credits-floor.ts); core cannot
// import a module, so the server action passes it in.
export async function saveTemplate(
  client: SupabaseClient,
  adminId: string,
  payload: SaveTemplatePayload,
  floor: ProviderFloors,
): Promise<void> {
  const template = parseOrThrow(templateInputSchema, payload.template, 'template')
  const prompt = parseOrThrow(promptInputSchema, payload.prompt, 'prompt')
  if (prompt.styleRefs?.some(ref => !isStyleRefKey(template.id, ref.key))) throw new AppError('INVALID_INPUT', '画风参考图不属于这个模板')
  assertAboveFloor(template, providerFloor(floor, prompt.providerId, template.id, template.category))
  assertTogglesWired(template, prompt)
  const exists = await repo.templateExists(client, template.id)
  if (payload.isNew && exists) {
    throw new AppError('INVALID_INPUT', `id "${template.id}" is already taken`)
  }
  if (!payload.isNew && !exists) throw new AppError('NOT_FOUND', `template ${template.id} not found`)
  // A brand-new template starts unpublished so it can be checked before anyone sees it.
  const toSave = payload.isNew ? { ...template, isActive: false } : template
  await repo.upsertTemplate(client, toSave, prompt, floor)
  logger.info('admin.template.saved', { adminId, templateId: template.id, isNew: payload.isNew })
}

// The 上架 switch and the bulk bar (T60) share this one path: same rules, same log line, same
// single write. 200 covers the whole catalogue many times over.
const setActiveSchema = z.object({
  ids: z
    .array(z.string().min(1).max(64))
    .min(1)
    .max(200)
    .refine((ids) => new Set(ids).size === ids.length, 'ids must be unique'),
  active: z.boolean(),
  reason: z.string().trim().max(500).optional(),
})

export async function setTemplatesActive(
  client: SupabaseClient,
  adminId: string,
  input: unknown,
  floor: ProviderFloors,
): Promise<ActiveChangeOutcome> {
  const { ids, active, reason } = parseOrThrow(setActiveSchema, input, 'input')
  // Unpublishing is a dangerous operation (DESIGN §7): it needs a stated reason.
  if (!active && !reason) throw new AppError('INVALID_INPUT', 'a reason is required to unpublish')
  const outcome = planActiveChange(ids, await repo.loadPublishCandidates(client, ids), active, floor)
  if (outcome.changed.length === 0) return outcome
  await repo.setTemplatesActive(client, outcome.changed.map((item) => item.id), active)
  // One line per template, the same audit record the single switch has always written.
  for (const item of outcome.changed) {
    logger.info('admin.template.active_changed', { adminId, templateId: item.id, active, reason })
  }
  return outcome
}

// The single switch: a batch of one whose refusal is an error the editor shows as-is.
export async function setTemplateActive(
  client: SupabaseClient,
  adminId: string,
  input: unknown,
  floor: ProviderFloors,
): Promise<void> {
  const { id, ...rest } = parseOrThrow(z.looseObject({ id: z.string() }), input, 'input')
  const [skipped] = (await setTemplatesActive(client, adminId, { ...rest, ids: [id] }, floor)).skipped
  if (!skipped) return
  if (skipped.blockers.includes('not_found')) throw new AppError('NOT_FOUND', `template ${id} not found`)
  throw new AppError('INVALID_INPUT', `「${skipped.name}」不能上架：${describeBlockers(skipped.blockers)}`)
}

// Drag-to-reorder (T76): one group's whole new order per save. The SQL function also refuses a
// list that is not exactly the group, so an out-of-date page cannot scramble the order.
const orderSchema = z.object({
  group: z.enum(['catalogue', 'featured']),
  ids: z
    .array(z.string().min(1).max(64))
    .max(500)
    .refine((ids) => new Set(ids).size === ids.length, 'ids must be unique'),
})

export async function setTemplateOrder(client: SupabaseClient, adminId: string, input: unknown): Promise<void> {
  const { group, ids } = parseOrThrow(orderSchema, input, 'input')
  await repo.setTemplateOrder(client, group, ids, adminId)
  logger.info('admin.template.reordered', { adminId, group, count: ids.length })
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
