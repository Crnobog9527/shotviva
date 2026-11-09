import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { AppError } from '../../errors'
import { editable } from './model'

export async function readEditableCode(db: SupabaseClient, id: string) {
  if (!z.uuid().safeParse(id).success) return null
  const { data, error } = await db.from('codes').select(
    'code,note,invitee_credits,invitee_pool,discount_percent,discount_duration,discount_months,discount_products,discount_valid_days,starts_at,expires_at,max_redemptions,new_users_only,redemption_count',
  ).eq('id',id).eq('kind','campaign').maybeSingle()
  if (error) throw new AppError('INTERNAL','Could not load code')
  return data ? editable.parse(data) : null
}
