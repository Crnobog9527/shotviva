import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

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

const TIER_LABEL = { '1k': '1K', '2k': '2K', '4k': '4K' } as const

// ARCHITECTURE §6.1: prices may go up, never below the floor for the template's quality tier.
function assertAboveFloor(template: z.infer<typeof templateInputSchema>, floor: ProviderFloors): void {
  const low = creditsBelowFloor(template.quality, template.creditsCost, floor, template.unpricedResolutions)
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

// The editor's checks before any write; `pnpm templates:apply` runs exactly these too.
export function validateTemplateSave(payload: Pick<SaveTemplatePayload, 'template' | 'prompt' | 'isNew'>, floor: ProviderFloors) {
  const template = parseOrThrow(templateInputSchema, payload.template, 'template')
  const prompt = parseOrThrow(promptInputSchema, payload.prompt, 'prompt')
  if (prompt.styleRefs?.some(ref => !isStyleRefKey(template.id, ref.key))) throw new AppError('INVALID_INPUT', '画风参考图不属于这个模板')
  assertAboveFloor(template, providerFloor(floor, prompt.providerId, template.id))
  assertTogglesWired(template, prompt)
  // A brand-new template starts unpublished so it can be checked before anyone sees it.
  return { template: payload.isNew ? { ...template, isActive: false } : template, prompt }
}

// `floor` is the image module's floor table (modules/image/credits-floor.ts); core cannot
// import a module, so the server action passes it in.
export async function saveTemplate(
  client: SupabaseClient,
  adminId: string,
  payload: SaveTemplatePayload,
  floor: ProviderFloors,
): Promise<number | undefined> {
  const { template: toSave, prompt } = validateTemplateSave(payload, floor)
  const revision = payload.revision && parseOrThrow(z.object({
    expected: z.int().positive(), selected: z.int().positive().optional(),
  }), payload.revision, 'revision')
  const assignment = payload.assignment && parseOrThrow(z.object({
    seriesId: z.uuid().nullable(), previousSeriesId: z.uuid().nullable().optional(), previousCategory: z.string().min(1).max(40).optional(),
  }), payload.assignment, 'assignment')
  const version = assignment
    ? await repo.saveAssignedTemplate(client, toSave, prompt, floor, { actor: adminId, isNew: payload.isNew, revision, assignment })
    : await saveLegacyTemplate(client, toSave, prompt, floor, payload.isNew, revision && { ...revision, actor: adminId })
  logger.info('admin.template.saved', { adminId, templateId: toSave.id, isNew: payload.isNew })
  return version
}

// Older admin callers send root keys only and have no assignment snapshot.
async function saveLegacyTemplate(client: SupabaseClient, template: z.infer<typeof templateInputSchema>, prompt: PromptInput,
  floor: ProviderFloors, isNew: boolean, revision?: { actor: string; expected: number; selected?: number }) {
  const exists = await repo.templateExists(client, template.id)
  if (isNew && exists) {
    throw new AppError('INVALID_INPUT', `id "${template.id}" is already taken`)
  }
  if (!isNew && !exists) throw new AppError('NOT_FOUND', `template ${template.id} not found`)
  return repo.upsertTemplate(client, template, prompt, floor, revision)
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
const orderIds = z.array(z.string().min(1).max(64)).max(500)
  .refine((ids) => new Set(ids).size === ids.length, 'ids must be unique')
const orderSchema = z.object({
  group: z.enum(['catalogue', 'featured', 'active', 'inactive']),
  ids: orderIds,
  expectedIds: orderIds.optional(),
})

export async function setTemplateOrder(client: SupabaseClient, adminId: string, input: unknown): Promise<void> {
  const { group, ids, expectedIds } = parseOrThrow(orderSchema, input, 'input')
  await repo.setTemplateOrder(client, group, ids, adminId, expectedIds)
  logger.info('admin.template.reordered', { adminId, group, count: ids.length })
}

// The home featured list (T53, ARCHITECTURE §12): ids in display order, at most 12, published
// web templates only (the SQL function enforces the last rule against the live rows).
export const FEATURED_MAX = 12
const featuredList = z
  .array(z.string().min(1).max(64))
  .max(FEATURED_MAX)
  .refine((ids) => new Set(ids).size === ids.length, 'ids must be unique')
// A bare list (older callers) or the list plus the one the page showed: with `expectedIds`, a
// list changed elsewhere since (another tab, the batch bar) is refused instead of overwritten.
const featuredSchema = z.union([featuredList, z.object({ ids: featuredList, expectedIds: featuredList })])

const sameList = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((id, i) => id === b[i])

export async function setFeaturedTemplates(client: SupabaseClient, adminId: string, input: unknown): Promise<void> {
  const parsed = parseOrThrow(featuredSchema, input, 'ids')
  const { ids, expectedIds } = Array.isArray(parsed) ? { ids: parsed, expectedIds: undefined } : parsed
  if (expectedIds && !sameList(await repo.readFeaturedIds(client), expectedIds)) {
    throw new AppError('CONFLICT', '首页精选在别处改过了，请刷新页面后再试')
  }
  await repo.setFeaturedTemplates(client, ids)
  logger.info('admin.template.featured', { adminId, count: ids.length })
}
