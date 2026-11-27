import type { CreateContext } from '../../workspace/use-workspace-draft'
import type { HomeViewer } from '../home-cta'

// Signed out: nothing to spend, no tier, no org; the form only shows (its primary is sign-up).
export const GUEST_CONTEXT: CreateContext = { balance: { free: 0, paid: 0 }, tier: null, batch: null, concurrency: { limit: 1, runningIds: [] }, poolChoice: null }

// What Create's dialog knows about the account, from the page's request-time read: the same
// balance, tier, batch limits, running jobs and org pool offer Create reads, so Generate reserves
// and charges exactly as there (reserve_credits still checks every charge on the server).
export const panelContext = (viewer: HomeViewer | null): CreateContext => viewer
  ? { balance: viewer.balance, tier: viewer.tier ?? null, batch: viewer.batch ?? null, concurrency: viewer.concurrency, poolChoice: viewer.poolChoice ?? null }
  : GUEST_CONTEXT
