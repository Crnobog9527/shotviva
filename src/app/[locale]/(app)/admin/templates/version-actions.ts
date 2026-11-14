'use server'

import { refresh } from 'next/cache'
import { runAdminAction, runAdminQuery } from '@/core/admin'
import { listVersions, manageVersion, readVersion } from '@/core/admin/templates'
import { duplicateTemplate } from '@/core/admin/template-copy'
import { createAdminSupabase, requireAdmin } from '@/core/auth'
import { publicEnv } from '@/core/public-env'
import { r2PublicStore, r2Store } from '@/core/storage'

export async function duplicateTemplateAction(input: unknown) {
  const admin = await requireAdmin()
  return runAdminQuery(async () => {
    const id = await duplicateTemplate({
      db: createAdminSupabase(), base: publicEnv.NEXT_PUBLIC_ASSETS_BASE_URL,
      stores: { public: r2PublicStore(), private: r2Store() },
    }, admin.id, input)
    refresh()
    return id
  })
}

export async function listVersionsAction(input: unknown) {
  await requireAdmin()
  return runAdminQuery(() => listVersions(createAdminSupabase(), input))
}

export async function readVersionAction(input: unknown) {
  await requireAdmin()
  return runAdminQuery(() => readVersion(createAdminSupabase(), input))
}

export async function manageVersionAction(input: unknown) {
  const actor = await requireAdmin()
  return runAdminAction(() => manageVersion(createAdminSupabase(), actor.id, input))
}
