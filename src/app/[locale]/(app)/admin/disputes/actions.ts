'use server'

import { refresh } from 'next/cache'

import { attachDisputeFile, createDisputeUpload, runAdminQuery, saveDisputeText, submitDispute, type ActionValue } from '@/core/admin'
import { createAdminSupabase, requireAdmin } from '@/core/auth'
import { stripeClient } from '@/core/billing/stripe'
import { r2Store } from '@/core/storage'

// /admin/disputes (T82). Server actions are public endpoints, so each re-checks the admin role;
// ids and payloads are validated again in core. Edits stay drafts; submit is the one send.

const deps = () => ({ stripe: stripeClient(), db: createAdminSupabase() })

export async function saveDisputeTextAction(input: { id: string; text: string }): Promise<ActionValue<{ saved: true }>> {
  await requireAdmin()
  return runAdminQuery(async () => {
    await saveDisputeText(deps(), input)
    refresh()
    return { saved: true as const }
  })
}

export async function createDisputeUploadAction(input: { id: string; contentType: string; size: number }) {
  await requireAdmin()
  return runAdminQuery(() => createDisputeUpload({ ...deps(), uploads: r2Store() }, input))
}

export async function attachDisputeFileAction(input: { id: string; key: string; field: string }): Promise<ActionValue<{ attached: true }>> {
  await requireAdmin()
  return runAdminQuery(async () => {
    await attachDisputeFile({ ...deps(), uploads: r2Store() }, input)
    refresh()
    return { attached: true as const }
  })
}

export async function submitDisputeAction(input: { id: string }): Promise<ActionValue<{ submittedAt: string }>> {
  const admin = await requireAdmin()
  return runAdminQuery(async () => {
    const at = await submitDispute(deps(), { id: input.id, actorId: admin.id })
    refresh()
    return { submittedAt: at.toISOString() }
  })
}
