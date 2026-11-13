import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { callRpc, type RpcClient } from '@/core/billing'
import { AppError } from '@/core/errors'
import { FEATURES, findFeature, type FeatureDefinition } from '@/core/features'
import { logger } from '@/core/logger'

import { FEATURES_COPY } from '../features-editor/copy'
import type { FeatureInvite } from './types'

// Invited accounts of an invite-only feature (1342 / 1343). Service role only; the database
// re-checks the admin and resolves the email or phone to an account.

const inviteRowSchema = z.object({
  user_id: z.uuid(), email: z.string().nullable(), phone: z.string().nullable(), created_at: z.string(),
})

export async function listFeatureInvites(db: SupabaseClient, key: string): Promise<FeatureInvite[]> {
  const rows = await callRpc(db, 'admin_list_feature_grants', { p_key: key }, inviteRowSchema.array())
  return rows.map((row) => ({
    userId: row.user_id,
    account: row.email ?? (row.phone ? `+${row.phone}` : row.user_id),
    invitedAt: row.created_at,
  }))
}

export const featureInviteSchema = z.object({
  key: z.string().min(1).max(40),
  account: z.string().trim().min(3).max(254),
  invited: z.boolean(),
})

export type FeatureInviteDeps = { db: RpcClient; registry?: readonly FeatureDefinition[] }

export async function setFeatureInvite(deps: FeatureInviteDeps, adminId: string, input: unknown): Promise<void> {
  const parsed = featureInviteSchema.safeParse(input)
  if (!parsed.success) throw new AppError('INVALID_INPUT', FEATURES_COPY.errors.invalid)
  const { key, account, invited } = parsed.data
  if (!findFeature(deps.registry ?? FEATURES, key)?.inviteOnly) throw new AppError('INVALID_INPUT', FEATURES_COPY.errors.unknownFeature)
  try {
    await callRpc(deps.db, 'admin_set_feature_grant', { p_actor: adminId, p_key: key, p_account: account, p_granted: invited }, z.uuid())
  } catch (error) {
    if (error instanceof AppError && error.code === 'NOT_FOUND') throw new AppError('NOT_FOUND', FEATURES_COPY.errors.noAccount)
    throw error
  }
  // The account itself is personal data: the log keeps the feature and the action only.
  logger.info('admin.feature_invite.saved', { adminId, key, invited })
}
