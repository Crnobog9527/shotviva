import type { Balance } from '@/core/billing/pools'
import type { MembershipTier } from '@/core/config'

import type { CatalogueTemplate } from '../catalogue/catalogue-template'
import type { AgainStart } from './again-start'

// Everything the creation form needs to open on a finished work in the Photos viewer: the
// template, the work's settings and kept photos, and what the account can spend and run now.
export type AgainContext = {
  template: CatalogueTemplate
  again: AgainStart
  balance: Balance
  tier: MembershipTier | null
  concurrency: { limit: number; runningIds: string[] }
}
