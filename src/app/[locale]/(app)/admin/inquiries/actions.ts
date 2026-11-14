'use server'

import { refresh } from 'next/cache'

import { runAdminAction, runAdminQuery, type ActionResult, type ActionValue } from '@/core/admin'
import { createAdminSupabase, requireAdmin } from '@/core/auth'
import type { BulkOutcome } from '@/core/admin/shell/bulk'
import { exportInquiries, loadAdminInquiry, setInquiriesStatus, updateInquiry, type AdminInquiry, type BulkInquirySkip } from '@/core/inquiries'

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

// The list's batch: one follow-up status for the ticked inquiries (notes untouched).
export async function bulkInquiryStatusAction(input: unknown): Promise<ActionValue<BulkOutcome<BulkInquirySkip>>> {
  await requireAdmin()
  return runAdminQuery(async () => {
    const outcome = await setInquiriesStatus(createAdminSupabase(), input)
    if (outcome.done.length > 0) refresh()
    return outcome
  })
}

// Every field of the ticked inquiries; the browser turns them into a CSV. Reads only.
export async function exportInquiriesAction(ids: unknown): Promise<ActionValue<AdminInquiry[]>> {
  await requireAdmin()
  return runAdminQuery(() => exportInquiries(createAdminSupabase(), ids))
}
