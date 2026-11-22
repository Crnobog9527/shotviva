// Drafts of the bulk sheet's two forms, kept outside the sheet (see kept-state.ts): the request id
// and the values it was made for travel together, so closing and reopening the sheet, switching
// between the two forms, or leaving selection mode never turns a retry into a new request. A draft
// belongs to one set of members; for another set it starts blank with a fresh id. The id rotates on
// an edit (a changed form is a new request) and on success.
export type Setting = { mode: 'keep' | 'set' | 'default'; value: string }
export type AllowanceDraft = { members: string; requestId: string; paid: Setting; promo: Setting }
export type GrantDraft = { members: string; requestId: string; kind: 'paid' | 'promo'; each: string }

export const membersKey = (members: readonly string[]) => [...members].sort().join(',')

export const blankAllowance = (members: string, newId: () => string): AllowanceDraft =>
  ({ members, requestId: newId(), paid: { mode: 'keep', value: '' }, promo: { mode: 'keep', value: '' } })
export const blankGrant = (members: string, newId: () => string): GrantDraft =>
  ({ members, requestId: newId(), kind: 'promo', each: '' })

// The stored draft if it is for these members, else a blank one (not stored until the first edit).
export function draftFor<T extends { members: string }>(stored: T, members: string, blank: () => T): T {
  return stored.members === members ? stored : blank()
}
