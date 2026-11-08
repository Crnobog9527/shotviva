import type { EvidenceContext } from './evidence'

// What the dispute flow needs from the site (T82). core never imports site: the webhook route
// and the admin pages build this from site.config and the legal pages (site/dispute-evidence.ts).
export type DisputeEvidenceConfig = {
  // Whether Managed Payments is on now: the answer for payments older than T82, which do not
  // record their route.
  managedPayments: boolean
  // The evidence context for a product id (null when the charge has no payment row).
  context: (productId: string | null, charge: EvidenceContext['charge']) => EvidenceContext
}

// The admin page of one dispute. The id goes in the query: the proxy lowercases every page path
// (建站规格 R4), and a Stripe id is case-sensitive, so /admin/disputes/du_1UZFae… would 404.
export const disputeAdminPath = (disputeId: string) => `/admin/disputes/view?id=${encodeURIComponent(disputeId)}`
