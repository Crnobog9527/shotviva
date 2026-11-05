import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { logger } from '../logger'

const ip = z.union([z.ipv4(), z.ipv6()])

// Vercel sets x-forwarded-for itself (client first), so the first hop is the visitor.
export function clientIp(headers: Pick<Headers, 'get'>): string | null {
  const candidate = headers.get('x-forwarded-for')?.split(',')[0]?.trim() || headers.get('x-real-ip')?.trim()
  const parsed = ip.safeParse(candidate)
  return parsed.success ? parsed.data : null
}

// Written once (first verified sign-in) so the free-credit grant can later limit per IP
// (ARCHITECTURE §7). Clients cannot update profiles, hence the service-role client.
export async function recordSignupIp(admin: SupabaseClient, userId: string, address: string | null) {
  if (!address) return
  const { error } = await admin
    .from('profiles')
    .update({ signup_ip: address })
    .eq('id', userId)
    .is('signup_ip', null)
  if (error) logger.warn('recording signup ip failed', { userId, code: error.code })
}
