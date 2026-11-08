'use server'

import { handleInquirySubmit, inquiryPrefill, type InquiryPrefill, type SubmitOutcome } from '@/core/inquiries'

// The For business inquiry dialog's two server actions (T86). Public on purpose: the form is for
// visitors without an account too (ARCHITECTURE §10.c). handleInquirySubmit validates the post
// and applies hCaptcha (production) and the per-IP / per-email limits; the prefill only reads the
// caller's own session.

export async function submitInquiryAction(input: unknown): Promise<SubmitOutcome> {
  return handleInquirySubmit(input)
}

export async function inquiryPrefillAction(): Promise<InquiryPrefill> {
  return inquiryPrefill()
}
