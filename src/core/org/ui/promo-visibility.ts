import type { ConsoleMember, OwnerConsole } from '../console/types'

// Promotion credits come only with the enterprise affiliate program (1842): an org that bought the
// workspace as a production tool sees paid credits only (Owner 2026-11-28). An org that just left
// the program keeps seeing what is left until the month-end expiry, so it can still hand it out or
// back. UI only: the server decides what it accepts.
export const orgShowsPromo = (org: OwnerConsole['org']) => org.affiliateEnabled || org.promoPoolCredits > 0

// A member's promotion line and forms also stay while they still hold promotion credits.
export const memberShowsPromo = (org: OwnerConsole['org'], member: ConsoleMember) => orgShowsPromo(org) || member.heldPromoCredits > 0

// Customers come with the program too; a member who brought some before it was turned off keeps the count.
export const memberShowsCustomers = (org: OwnerConsole['org'], member: ConsoleMember) => org.affiliateEnabled || member.customers > 0

// The month's table keeps its promotion column while members still hold some.
export const monthShowsPromo = (org: OwnerConsole['org'], month: OwnerConsole['poolMonth']) => orgShowsPromo(org) || (month?.promo.held ?? 0) > 0
