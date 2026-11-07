'use server'

import { refresh, revalidateTag } from 'next/cache'

import { runAdminQuery, saveAnnouncement, setAnnouncementActive, type ActionValue } from '@/core/admin'
import { ANNOUNCEMENTS_CACHE_TAG } from '@/core/announcements'
import { createAdminSupabase, requireAdmin } from '@/core/auth'

// Server actions are public endpoints, so each one re-checks the admin role itself. Every
// change marks the banner cache stale (ARCHITECTURE §10), stale-while-revalidate: the first
// visitor after a save may still see the previous banner while every page behind them gets the
// new one, instead of that visitor waiting for the page to re-render (performance B1).
function bannerChanged() {
  revalidateTag(ANNOUNCEMENTS_CACHE_TAG, 'max')
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
