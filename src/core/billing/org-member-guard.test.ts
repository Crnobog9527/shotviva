import { describe, expect, it } from 'vitest'

import { assertNotOrgMember } from './org-member-guard'

function client(result: { data: unknown[] | null; error: { message: string } | null }, eqs: unknown[][] = []) {
  const chain = { select: () => chain, eq: (...a: unknown[]) => (eqs.push(a), chain), limit: async () => result }
  return { from: () => chain } as never
}

describe('assertNotOrgMember', () => {
  it('lets an account in no org through', async () => {
    await expect(assertNotOrgMember(client({ data: [], error: null }), 'u')).resolves.toBeUndefined()
  })
  it('refuses an active staff member with ORG_MEMBER_CHECKOUT, looking only at role member (the owner buys)', async () => {
    const eqs: unknown[][] = []
    await expect(assertNotOrgMember(client({ data: [{ org_id: 'o' }], error: null }, eqs), 'u')).rejects.toMatchObject({ code: 'ORG_MEMBER_CHECKOUT' })
    expect(eqs).toEqual([['user_id', 'u'], ['status', 'active'], ['role', 'member']])
  })
  it('fails closed when the lookup fails', async () => {
    await expect(assertNotOrgMember(client({ data: null, error: { message: 'down' } }), 'u')).rejects.toMatchObject({ code: 'INTERNAL' })
  })
})
