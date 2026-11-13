'use server'

import { revalidatePath, updateTag } from 'next/cache'
import { z } from 'zod'

import { runAdminQuery } from '@/core/admin/templates'
import type { SaveProfileInput, SwitchInput } from '@/core/admin/template-profiles'
import { getProfileDetail, saveTemplateProfile, switchTemplateProfiles } from '@/core/admin/template-profiles/repository'
import { createAdminSupabase, requireAdmin } from '@/core/auth'
import { TEMPLATES_CACHE_TAG } from '@/core/templates'

const detailInput = z.object({ id: z.string().min(1).max(64), profile: z.enum(['openai', 'seedream']) })

export async function profileDetailAction(input: unknown) {
  await requireAdmin()
  return runAdminQuery(async () => {
    const { id, profile } = detailInput.parse(input)
    return getProfileDetail(createAdminSupabase(), id, profile)
  })
}

// The profile that is not live: nothing on the site changes, so no cache to expire.
export async function saveProfileAction(input: SaveProfileInput) {
  const admin = await requireAdmin()
  return runAdminQuery(async () => {
    const version = await saveTemplateProfile(createAdminSupabase(), admin.id, input)
    revalidatePath('/[locale]/admin/templates/profiles', 'page')
    return version
  })
}

export async function switchProfilesAction(input: SwitchInput) {
  const admin = await requireAdmin()
  return runAdminQuery(async () => {
    const rows = await switchTemplateProfiles(createAdminSupabase(), admin.id, input)
    if (!input.validateOnly && rows.some(row => row.ok && !row.unchanged)) {
      // Prices, tiers and the model of the switched templates show on every catalogue page.
      updateTag(TEMPLATES_CACHE_TAG)
      revalidatePath('/[locale]/admin/templates', 'page')
      revalidatePath('/[locale]/admin/templates/profiles', 'page')
    }
    return rows
  })
}
