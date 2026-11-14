import { z } from 'zod'

export const MAX_INVITE_REWARD = 10_000
const amount = z.int().min(0).max(MAX_INVITE_REWARD)
export const inviteRewards = z.object({ inviteeCredits: amount, inviterCredits: amount })
export type InviteRewards = z.infer<typeof inviteRewards>
