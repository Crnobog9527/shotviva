import 'server-only'
import { z } from 'zod'

import { inviteRewards } from '../../codes'
import { callRpc, type RpcClient } from '../../billing'

// The cursor identifies a redemption, never a friend's account. Strip extra fields before
// crossing the server/client boundary, including any future personal data in the SQL response.
export const inviteCursor = z.object({ id: z.uuid(), created_at: z.iso.datetime({ offset: true }) })
const friend = inviteCursor.extend({ registered_at: z.iso.datetime({ offset: true }), purchased: z.boolean() })
const summary = z.object({
  code: z.string().regex(/^[A-Z0-9]{8}$/),
  rewards: inviteRewards,
  invited: z.number().int().nonnegative(),
  purchasers: z.number().int().nonnegative(),
  earned: z.number().int().nonnegative(),
  reward_window_days: z.number().int().positive().optional(),
  rewards_left: z.number().int().nonnegative(),
  friends: z.array(friend).max(30),
})

export type InviteSummary = z.infer<typeof summary>
export type InviteCursor = z.infer<typeof inviteCursor>
export type LoadInvites = (cursor?: InviteCursor) => Promise<InviteSummary>

export function readInviteSummary(db: RpcClient, userId: string, cap: number, cursor?: InviteCursor) {
  return callRpc(db, 'my_invite_summary', { p_user: userId, p_inviter_cap: cap, p_cursor: cursor ?? null }, summary)
}
