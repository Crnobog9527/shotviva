import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { AppError } from '@/core/errors'
import { logger } from '@/core/logger'
import { promptInputSchema, templateInputSchema } from '@/core/templates'

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

export async function saveTemplate(
  client: SupabaseClient,
  adminId: string,
  payload: SaveTemplatePayload,
): Promise<void> {
  const template = parseOrThrow(templateInputSchema, payload.template, 'template')
  const prompt = parseOrThrow(promptInputSchema, payload.prompt, 'prompt')
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
