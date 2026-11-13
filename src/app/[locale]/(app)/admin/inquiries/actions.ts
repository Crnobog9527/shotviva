'use server'

import { refresh } from 'next/cache'

import { runAdminAction, runAdminQuery, type ActionResult, type ActionValue } from '@/core/admin'
import { createAdminSupabase, requireAdmin } from '@/core/auth'
import { loadAdminInquiry, updateInquiry, type AdminInquiry } from '@/core/inquiries'

// Server actions are public endpoints, so this re-checks the admin role itself; the input is
// validated again in core/inquiries before the update.
export async function saveInquiryAction(input: unknown): Promise<ActionResult> {
  await requireAdmin()
  return runAdminAction(async () => {
    await updateInquiry(createAdminSupabase(), input)
    refresh()
  })
}

// The inquiry dialog's read (?inquiry=<id> on /admin/inquiries): every field by primary key.
export async function inquiryDetailAction(id: string): Promise<ActionValue<AdminInquiry | null>> {
  await requireAdmin()
  return runAdminQuery(() => loadAdminInquiry(createAdminSupabase(), id))
}
