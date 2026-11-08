import 'server-only'

import { headers } from 'next/headers'
import { z } from 'zod'

import { notifyOwner } from '../alerts'
import { getSessionUser } from '../auth/session'
import { clientIp } from '../auth/signup-ip'
import { createAdminSupabase } from '../auth/supabase-admin'
import { serverEnv } from '../env'
import { logger } from '../logger'
import { publicEnv } from '../public-env'
import { captchaCheck, captchaConfig } from './captcha'
import { inquiryIpHash } from './ip-hash'
import { INQUIRY_PAGES } from './rules'
import { submitInquiry, type SubmitOutcome } from './submit'

// The two server actions behind the pricing page's inquiry dialog, wired to the real services.
// They are public on purpose: the form is for visitors who may have no account (ARCHITECTURE
// §10.c). The input is validated in submitInquiry; hCaptcha (production) and the per-IP and
// per-email limits in 0801 keep it from being abused.

const pageSchema = z.object({ page: z.enum(INQUIRY_PAGES) })

export async function handleInquirySubmit(input: unknown): Promise<SubmitOutcome> {
  const where = pageSchema.safeParse(input)
  if (!where.success) return { ok: false, error: 'INVALID_INPUT' }
  const { page } = where.data
  try {
    const env = serverEnv()
    const secret = env.SUPABASE_SERVICE_ROLE_KEY
    if (!secret) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')
    const [user, ip] = await Promise.all([getSessionUser(), headers().then(clientIp)])
    const captcha = captchaConfig(env.HCAPTCHA_SECRET, publicEnv.NEXT_PUBLIC_HCAPTCHA_SITEKEY)
    return await submitInquiry(
      { db: createAdminSupabase(), captcha: captcha ? captchaCheck(captcha) : null, notify: notifyOwner },
      input,
      { locale: page === '/zh/pricing' ? 'zh' : 'en', page, userId: user?.id ?? null, ip, ipHash: inquiryIpHash(ip, secret) },
    )
  } catch (error) {
    logger.error('business inquiry failed', { error })
    return { ok: false, error: 'generic' }
  }
}

export type InquiryPrefill = { email: string | null; phone: string | null }

// A signed-in visitor's email (and a phone account's number, with its +), to start the form
// with; they can change both. Nothing for a visitor.
export async function inquiryPrefill(): Promise<InquiryPrefill> {
  try {
    const user = await getSessionUser()
    return { email: user?.email ?? null, phone: user?.phone ? `+${user.phone}` : null }
  } catch {
    return { email: null, phone: null }
  }
}
