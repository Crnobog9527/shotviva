// Shared by the server command (bind-partner.ts) and the bind dialog (users-ui).

// The longest back-dating window an admin can choose (migration 2029 checks it again).
export const BACKDATE_MAX_DAYS = 90

export type PartnerOption = { id: string; name: string; slug: string; status: string; enterprise: boolean }

// What the binding did: changed = the account moved to this partner (false: it already was its
// customer); created = back-dated commissions written; already = payments this partner already
// earned on; otherPartner = payments left with the partner who earned on them; failed = payments
// whose commission could not be written (kept in the recompute error queue for the daily retry).
export type BindOutcome = { changed: boolean; created: number; already: number; otherPartner: number; failed: number }

export type BindInput = { userId: string; partnerId: string; reason: string; backdateDays: number }
