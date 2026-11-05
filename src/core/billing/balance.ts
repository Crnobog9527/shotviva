import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { AppError } from '../errors'
import type { Balance } from './pools'

const balanceRowSchema = z.object({
  credits: z.number().int().nonnegative(),
  free_credits: z.number().int().nonnegative(),
})

// The signed-in user's two pools, read through RLS (profiles_select_own) with their own
// session client. A missing profile reads as empty rather than failing the page.
export async function readBalance(client: SupabaseClient, userId: string): Promise<Balance> {
  const { data, error } = await client.from('profiles').select('credits, free_credits').eq('id', userId).maybeSingle()
  if (error) throw new AppError('INTERNAL', `readBalance failed: ${error.message}`)
  if (data === null) return { paid: 0, free: 0 }
  const row = balanceRowSchema.parse(data)
  return { paid: row.credits, free: row.free_credits }
}
