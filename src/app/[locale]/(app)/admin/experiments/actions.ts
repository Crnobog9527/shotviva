'use server'

import { refresh } from 'next/cache'

import { actOnExperiment, runAdminQuery, saveExperiment, type ActionValue } from '@/core/admin'
import { createAdminSupabase, requireAdmin } from '@/core/auth'
import { experimentRegistry } from '@/site/experiments'

// Server actions are public endpoints, so each one re-checks the admin role itself. The proxy
// picks up a change within its hold time (core/experiments/live-config.ts); no cache tag to expire.

export async function saveExperimentAction(input: unknown): Promise<ActionValue<number>> {
  const admin = await requireAdmin()
  return runAdminQuery(async () => {
    const id = await saveExperiment(createAdminSupabase(), admin.id, input, experimentRegistry)
    refresh()
    return id
  })
}

export async function actOnExperimentAction(input: unknown): Promise<ActionValue<null>> {
  const admin = await requireAdmin()
  return runAdminQuery(async () => {
    await actOnExperiment(createAdminSupabase(), admin.id, input)
    refresh()
    return null
  })
}
