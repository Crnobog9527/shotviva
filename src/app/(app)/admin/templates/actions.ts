'use server'

import { refresh } from 'next/cache'

import {
  reorderTemplates,
  runAdminAction,
  saveTemplate,
  setTemplateActive,
  type ActionResult,
  type SaveTemplatePayload,
} from '@/core/admin'
import { createAdminSupabase, requireAdmin } from '@/core/auth'

// Server actions are public endpoints, so each one re-checks the admin role itself.

export async function saveTemplateAction(payload: SaveTemplatePayload): Promise<ActionResult> {
  const admin = await requireAdmin()
  return runAdminAction(async () => {
    await saveTemplate(createAdminSupabase(), admin.id, payload)
    refresh()
  })
}

export async function setTemplateActiveAction(input: unknown): Promise<ActionResult> {
  const admin = await requireAdmin()
  return runAdminAction(async () => {
    await setTemplateActive(createAdminSupabase(), admin.id, input)
    refresh()
  })
}

export async function reorderTemplatesAction(ids: unknown): Promise<ActionResult> {
  const admin = await requireAdmin()
  return runAdminAction(async () => {
    await reorderTemplates(createAdminSupabase(), admin.id, ids)
    refresh()
  })
}
