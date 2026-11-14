import type { NextRequest } from 'next/server'

import { createAdminSupabase } from '@/core/auth'
import { authorizeSmsSend, handleSmsHook } from '@/core/auth/phone'
import { serverEnv } from '@/core/env'
import { smsSenderFor } from '@/core/sms'

// Public on purpose: Supabase Auth calls it without a session (the "Send SMS" hook, T63). The
// Standard Webhooks signature is the authentication, checked first in handleSmsHook; the body
// stays raw text because the signature covers the exact bytes. The body carries the code, so
// nothing here logs the request.
export async function POST(request: NextRequest) {
  const env = serverEnv()
  const response = await handleSmsHook(request, {
    secret: env.SEND_SMS_HOOK_SECRET,
    sender: smsSenderFor(env),
    authorize: (key) => authorizeSmsSend(createAdminSupabase(), key),
  })
  response.headers.set('Cache-Control', 'no-store')
  return response
}
