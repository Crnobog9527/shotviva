'use server'

import { refresh } from 'next/cache'
import { z } from 'zod'
import { COPY } from '@/core/admin/code-reports'
import { createAdminSupabase, requireAdmin } from '@/core/auth'
import { inviteRewards, type InviteRewards } from '@/core/codes'
import { logger } from '@/core/logger'

const integerField = z.string().regex(/^\d{1,5}$/).transform(Number)
const fields = z.object({ inviteeCredits: integerField, inviterCredits: integerField }).pipe(inviteRewards)

export async function saveInviteRewards(expected: InviteRewards, _previous: string, form: FormData) {
  const actor = await requireAdmin()
  const original = inviteRewards.safeParse(expected)
  const input = fields.safeParse(Object.fromEntries(form))
  if (!original.success || !input.success) return COPY.invalid
  const { error } = await createAdminSupabase().rpc('admin_save_invite_rewards', {
    p_actor: actor.id, p_invitee: input.data.inviteeCredits, p_inviter: input.data.inviterCredits, p_expected: original.data,
  })
  if (error?.message === 'INVITE_SETTINGS_CHANGED') return COPY.staleRewards
  if (error) {
    logger.error('admin.codes.invite_settings_failed', { code: error.code })
    return COPY.failed
  }
  refresh()
  return COPY.savedRewards
}
