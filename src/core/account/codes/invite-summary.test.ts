import { describe, expect, it, vi } from 'vitest'

import { invite, seededRewards } from '../../../../tests/t94-config'

import { readInviteSummary } from './invite-summary'

const time = '2026-11-09T10:00:00+00:00'
const cursor = { id: 'e6e93ed1-2e1d-46cd-a544-1dc44ddf0150', created_at: time }
const summary = { code: 'AB4CD789', rewards: { inviteeCredits: 17, inviterCredits: 29 }, invited: 1, purchasers: 1, earned: seededRewards.inviterCredits, rewards_left: invite.inviterRewardCap - 1, reward_window_days: 4 }

describe('account invitation list', () => {
  it('scopes keyset paging to the signed-in user and strips private fields before serializing friends', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null, data: {
      ...summary, friends: [{ ...cursor, registered_at: time, purchased: true, email: 'private@example.test', phone: 'hidden', user_id: 'private' }],
    } })
    expect(await readInviteSummary({ rpc }, 'signed-in', invite.inviterRewardCap, cursor)).toEqual({
      ...summary, friends: [{ ...cursor, registered_at: time, purchased: true }],
    })
    expect(rpc).toHaveBeenCalledWith('my_invite_summary', { p_user: 'signed-in', p_inviter_cap: invite.inviterRewardCap, p_cursor: cursor })
  })
})
