import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { AppError } from '../errors'

const schema = z.object({ maxCreditsPerCode: z.int32().positive(), requirePaidGiftCap: z.boolean() })
export type GiftPolicy = z.infer<typeof schema>

export async function readGiftPolicy(db: SupabaseClient): Promise<GiftPolicy> {
  const { data, error } = await db.from('system_settings').select('value').eq('key', 'code_gift_policy').single()
  if (error) throw new AppError('INTERNAL', 'Could not load gift policy')
  return schema.parse(data.value)
}
