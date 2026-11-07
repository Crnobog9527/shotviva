import type { EvidenceContext } from './evidence'

// What the dispute flow needs from the site (T82). core never imports site: the webhook route
// and the admin pages build this from site.config and the legal pages (site/dispute-evidence.ts).
export type DisputeEvidenceConfig = {
  // Whether Managed Payments is on now: the answer for payments older than T82, which do not
  // record their route.
  managedPayments: boolean
  // This deployment's origin, for the admin link in the alert.
  adminOrigin: string
  // The evidence context for a product id (null when the charge has no payment row).
  context: (productId: string | null, charge: EvidenceContext['charge']) => EvidenceContext
}

export const disputeAdminPath = (disputeId: string) => `/admin/disputes/${encodeURIComponent(disputeId)}`
