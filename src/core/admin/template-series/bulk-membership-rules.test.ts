import { describe, expect, it } from 'vitest'

import { nextMembers } from './bulk-membership-rules'

describe('batch join a series', () => {
  it('appends newcomers after the current members, in ticked order', () => {
    expect(nextMembers(['a', 'b'], ['d', 'b', 'c'])).toEqual(['a', 'b', 'd', 'c'])
  })

  it('changes nothing when every ticked template is a member already', () => {
    expect(nextMembers(['a', 'b'], ['b'])).toBeNull()
  })
})
