import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { AppError } from '@/core/errors'

// Sets the admin's tag for an account from /admin/users (migration 1994). The actor is the signed-in
// admin from the server session; the SQL function checks the role again. Blank clears the tag.
const input = z.object({ userId: z.uuid(), label: z.string().max(200).nullable() })

const KNOWN: Record<string, string> = {
  INVALID_INPUT: '备注最多 60 个字。',
  USER_NOT_FOUND: '找不到这个账号。',
  NOT_ADMIN: '只有管理员可以改备注。',
}

export async function setUserLabel(db: SupabaseClient, actorId: string, raw: unknown): Promise<string | null> {
  const parsed = input.safeParse(raw)
  if (!parsed.success) throw new AppError('INVALID_INPUT', KNOWN.INVALID_INPUT)
  const { userId, label } = parsed.data
  if (label !== null && label.trim().length > 60) throw new AppError('INVALID_INPUT', KNOWN.INVALID_INPUT)
  const { data, error } = await db.rpc('admin_set_user_label', { p_actor: actorId, p_user: userId, p_label: label })
  if (error) {
    const known = KNOWN[error.message]
    if (known) throw new AppError('INVALID_INPUT', known)
    throw new AppError('INTERNAL', 'admin set user label failed', { cause: new Error(error.message) })
  }
  return z.string().nullable().parse(data)
}
