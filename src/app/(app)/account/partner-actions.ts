'use server'

import { refresh } from 'next/cache'

import { createAdminSupabase, requireUser } from '@/core/auth'
import { revokeLink } from '@/core/partner'

// "Disconnect Graylum": the next partner call for this account answers 401 link_revoked.
export async function disconnectGraylumAction() {
  const user = await requireUser('/account')
  await revokeLink(createAdminSupabase(), user.id)
  refresh()
}
