import { timingSafeEqual, createHash } from 'node:crypto'
import { createAdminSupabase } from '@/core/auth/supabase-admin'
import { serverEnv } from '@/core/env'
import { logger } from '@/core/logger'

const digest = (value: string) => createHash('sha256').update(value).digest()

// Called by Vercel cron with its bearer credential, independently of user sessions.
export async function GET(request: Request) {
  const secret = serverEnv().CRON_SECRET
  if (!secret || !timingSafeEqual(digest(request.headers.get('authorization') ?? ''), digest('Bearer ' + secret))) {
    return new Response(null, { status: 401 })
  }
  const { error } = await createAdminSupabase().rpc('affiliate_daily', { p_today: new Date().toISOString().slice(0, 10) })
  if (error) logger.error('affiliate daily failed', { code: error.code })
  return new Response(null, { status: error ? 500 : 204 })
}
