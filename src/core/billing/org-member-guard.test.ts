import { describe, expect, it } from 'vitest'

import { assertNotOrgMember } from './org-member-guard'

function client(result: { data: unknown[] | null; error: { message: string } | null }) {
  const chain = { select: () => chain, eq: () => chain, limit: async () => result }
  return { from: () => chain } as never
}

describe('assertNotOrgMember', () => {
  it('lets an account in no org through', async () => {
    await expect(assertNotOrgMember(client({ data: [], error: null }), 'u')).resolves.toBeUndefined()
  })
  it('refuses an active member (owner included) with ORG_MEMBER_CHECKOUT', async () => {
    await expect(assertNotOrgMember(client({ data: [{ org_id: 'o' }], error: null }), 'u')).rejects.toMatchObject({ code: 'ORG_MEMBER_CHECKOUT' })
  })
  it('fails closed when the lookup fails', async () => {
    await expect(assertNotOrgMember(client({ data: null, error: { message: 'down' } }), 'u')).rejects.toMatchObject({ code: 'INTERNAL' })
  })
})
