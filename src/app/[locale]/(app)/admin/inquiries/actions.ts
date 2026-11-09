'use server'

import { refresh } from 'next/cache'

import { runAdminAction, type ActionResult } from '@/core/admin'
import { createAdminSupabase, requireAdmin } from '@/core/auth'
import { updateInquiry } from '@/core/inquiries'

// Server actions are public endpoints, so this re-checks the admin role itself; the input is
// validated again in core/inquiries before the update.
export async function saveInquiryAction(input: unknown): Promise<ActionResult> {
  await requireAdmin()
  return runAdminAction(async () => {
    await updateInquiry(createAdminSupabase(), input)
    refresh()
  })
}
