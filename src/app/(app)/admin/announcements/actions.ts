'use server'

import { refresh, updateTag } from 'next/cache'

import { runAdminQuery, saveAnnouncement, setAnnouncementActive, type ActionValue } from '@/core/admin'
import { ANNOUNCEMENTS_CACHE_TAG } from '@/core/announcements'
import { createAdminSupabase, requireAdmin } from '@/core/auth'

// Server actions are public endpoints, so each one re-checks the admin role itself. Every
// change expires the banner cache at once (ARCHITECTURE §10).
function bannerChanged() {
  updateTag(ANNOUNCEMENTS_CACHE_TAG)
  refresh()
}

export async function saveAnnouncementAction(input: unknown): Promise<ActionValue<string>> {
  const admin = await requireAdmin()
  return runAdminQuery(async () => {
    const id = await saveAnnouncement(createAdminSupabase(), admin.id, input)
    bannerChanged()
    return id
  })
}

export async function setAnnouncementActiveAction(input: { id: string; active: boolean }): Promise<ActionValue<string[]>> {
  const admin = await requireAdmin()
  return runAdminQuery(async () => {
    const stopped = await setAnnouncementActive(createAdminSupabase(), admin.id, input)
    bannerChanged()
    return stopped
  })
}
