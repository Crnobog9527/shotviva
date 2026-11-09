'use server'

import { createAdminSupabase, requireUser } from '@/core/auth'
import { inviteCursor, readInviteSummary, type InviteCursor } from '@/core/account/codes'
import { site } from '@/site/site.config'

export async function loadMyInvites(cursor?: InviteCursor) {
  const user = await requireUser('/account')
  return readInviteSummary(createAdminSupabase(), user.id, site.growth.invite.inviterCapPer30d, inviteCursor.optional().parse(cursor))
}
