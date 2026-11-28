import type { OrgStatus } from '../console/types'

// How an org is set up (Owner 2026-11-28): the enterprise workspace (orgs.status 'active') and the
// enterprise affiliate program (orgs.affiliate_enabled) are sold separately, so an org has either,
// both or, once both are turned off, neither. 'suspended' is the admin's workspace switch, not a
// penalty: an org with the affiliate program on and the workspace off still runs its referrals.
export type OrgSetup = 'both' | 'workspace' | 'affiliate' | 'off'

export function orgSetup(status: OrgStatus, affiliateEnabled: boolean): OrgSetup {
  if (status === 'active') return affiliateEnabled ? 'both' : 'workspace'
  return affiliateEnabled ? 'affiliate' : 'off'
}

export const workspaceOn = (setup: OrgSetup) => setup === 'both' || setup === 'workspace'
