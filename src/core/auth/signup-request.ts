import 'server-only'

import { createHash } from 'node:crypto'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { AppError } from '../errors'

// Email sign-ups go through our server first (ARCHITECTURE §7, migration 1350): signup_request
// counts the visitor's real IP (5 an hour, 20 a day) and leaves the row the Before User Created
// hook looks for. An account the Auth API is asked to create with no row from the last 10
// minutes is refused, so a script that skips this site gets nothing. Service-role client only.

const statusSchema = z.enum(['ok', 'ip_hourly', 'ip_daily'])
export type SignupRequestStatus = z.infer<typeof statusSchema>

// The hook hashes the same way: sha256 hex of the trimmed, lower-cased address.
export function emailKey(email: string): string {
  return createHash('sha256').update(email.trim().toLowerCase()).digest('hex')
}

export async function requestSignup(db: Pick<SupabaseClient, 'rpc'>, email: string, ip: string | null): Promise<SignupRequestStatus> {
  const { data, error } = await db.rpc('signup_request', { p_email_key: emailKey(email), p_ip: ip })
  if (error) throw new AppError('INTERNAL', 'signup_request failed', { cause: new Error(error.message) })
  return statusSchema.parse(data)
}
