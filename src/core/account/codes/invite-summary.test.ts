import { describe, expect, it, vi } from 'vitest'

import { readInviteSummary } from './invite-summary'

const time = '2026-11-09T10:00:00+00:00'
const cursor = { id: 'e6e93ed1-2e1d-46cd-a544-1dc44ddf0150', created_at: time }
const summary = { code: 'AB4CD789', invited: 1, purchasers: 1, earned: 10, rewards_left: 19 }

describe('account invitation list', () => {
  it('scopes keyset paging to the signed-in user and strips private fields before serializing friends', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null, data: {
      ...summary, friends: [{ ...cursor, registered_at: time, purchased: true, email: 'private@example.test', phone: 'hidden', user_id: 'private' }],
    } })
    expect(await readInviteSummary({ rpc }, 'signed-in', 20, cursor)).toEqual({
      ...summary, friends: [{ ...cursor, registered_at: time, purchased: true }],
    })
    expect(rpc).toHaveBeenCalledWith('my_invite_summary', { p_user: 'signed-in', p_inviter_cap: 20, p_cursor: cursor })
  })
})
