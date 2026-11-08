import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import type { BusinessInquiryAlert } from '../alerts/alert-kinds'
import type { Locale } from '../i18n/locales'
import { logger } from '../logger'
import type { CaptchaCheck } from './captcha'
import type { InquiryPage } from './rules'
import { inquiryShape, validateInquiry, type FieldErrors, type InquiryValues } from './validate'

// The form's one server step (ARCHITECTURE §10.c): check the post, the invisible hCaptcha and the
// limits, store the row, tell the Owner in Feishu. Never throws to the caller: every outcome is a
// value the form can word.

export type InquiryContext = {
  locale: Locale
  page: InquiryPage
  userId: string | null
  ip: string | null
  ipHash: string | null
}

export type SubmitDeps = {
  db: SupabaseClient
  // null: hCaptcha is off here (no site key or no secret).
  captcha: CaptchaCheck | null
  notify: (alert: BusinessInquiryAlert) => void
}

export type SubmitError = 'INVALID_INPUT' | 'RATE_LIMITED' | 'CAPTCHA_FAILED' | 'generic'
export type SubmitOutcome = { ok: true } | { ok: false; error: SubmitError; fields?: FieldErrors }

const post = z.object({ values: inquiryShape, captchaToken: z.string().max(10_000).nullable().default(null) })
const answer = z.object({ status: z.enum(['ok', 'ip_hourly', 'ip_daily', 'email_daily']), id: z.uuid().nullable() })

const orNull = (value: string) => value.trim() || null

// The row as submit_business_inquiry (0801) reads it: trimmed, empty optional fields as null.
export function inquiryRow(values: InquiryValues, ctx: InquiryContext) {
  return {
    locale: ctx.locale,
    page: ctx.page,
    user_id: ctx.userId,
    name: values.name.trim(),
    email: values.email.trim(),
    company: values.company.trim(),
    monthly_volume: values.volume,
    uses: values.uses,
    message: values.message.trim(),
    job_title: orNull(values.jobTitle),
    website: orNull(values.website),
    wechat: orNull(values.wechat),
    phone: orNull(values.phone),
    team_size: values.teamSize || null,
    country: orNull(values.country),
    platforms: values.platforms,
    needs: values.needs,
    start_time: values.startTime || null,
  }
}

// One round trip: submit_business_inquiry checks the limits and inserts (0801).
async function store(db: SupabaseClient, values: InquiryValues, ctx: InquiryContext): Promise<{ ok: true; id: string } | { ok: false; error: SubmitError }> {
  const { data, error } = await db.rpc('submit_business_inquiry', { p_inquiry: inquiryRow(values, ctx), p_ip_hash: ctx.ipHash })
  if (error) {
    // 23514: a check in 0800 the validator let through. Anything else is ours.
    if (error.code === '23514') return { ok: false, error: 'INVALID_INPUT' }
    logger.error('business inquiry not stored', { code: error.code, message: error.message })
    return { ok: false, error: 'generic' }
  }
  const result = answer.safeParse(data)
  if (!result.success) {
    logger.error('business inquiry: unexpected answer', { issues: result.error.issues.length })
    return { ok: false, error: 'generic' }
  }
  if (result.data.status !== 'ok' || !result.data.id) {
    logger.info('business inquiry limited', { status: result.data.status })
    return { ok: false, error: 'RATE_LIMITED' }
  }
  return { ok: true, id: result.data.id }
}

export async function submitInquiry(deps: SubmitDeps, input: unknown, ctx: InquiryContext): Promise<SubmitOutcome> {
  const parsed = post.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' }
  const { values, captchaToken } = parsed.data
  const fields = validateInquiry(values)
  if (Object.keys(fields).length > 0) return { ok: false, error: 'INVALID_INPUT', fields }
  if (deps.captcha && !(await deps.captcha(captchaToken, ctx.ip))) return { ok: false, error: 'CAPTCHA_FAILED' }

  const stored = await store(deps.db, values, ctx)
  if (!stored.ok) return stored
  // volume is set: validateInquiry passed.
  if (values.volume) deps.notify({ kind: 'business_inquiry', inquiryId: stored.id, company: values.company.trim(), volume: values.volume, uses: values.uses })
  return { ok: true }
}
