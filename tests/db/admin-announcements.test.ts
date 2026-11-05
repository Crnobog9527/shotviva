import type { Client } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { saveAnnouncement, setAnnouncementActive } from '@/core/admin'
import { loadBannerCandidates, localize, pickLive } from '@/core/announcements'

import { connectAdmin, createUser } from './helpers'
import { anonSupabase, serviceSupabase } from './supabase-env'

// T23: site_announcements, its overlap rule and the switch (ARCHITECTURE §10), through the
// same commands the admin page calls.

let db: Client
let admin: string
const service = serviceSupabase()
const HOUR = 60 * 60 * 1000
const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString()

const draft = (patch: Record<string, unknown> = {}) => ({
  messageEn: 'Black Friday: 30% off packs',
  messageZh: '黑五：积分包七折',
  linkUrl: '/pricing',
  linkLabelEn: 'See pricing',
  linkLabelZh: '看价格',
  tone: 'promo',
  startsAt: null,
  endsAt: null,
  ...patch,
})

const activeRows = async () =>
  (await db.query<{ id: string }>('select id from public.site_announcements where is_active order by id')).rows.map((r) => r.id)

beforeAll(async () => {
  db = await connectAdmin()
  admin = await createUser(db)
})

// The table is global; each test starts from no active announcement.
beforeEach(async () => {
  await db.query('update public.site_announcements set is_active = false where is_active')
})

afterAll(async () => {
  await db.end()
})

describe('site_announcements access', () => {
  it('refuses the anon client entirely', async () => {
    const { data, error } = await anonSupabase().from('site_announcements').select('id')
    expect(data ?? []).toEqual([])
    expect(error?.message ?? 'denied').toMatch(/denied|permission/i)
  })

  it('rejects a bad link or a reversed window at the database too', async () => {
    await expect(
      db.query("insert into public.site_announcements (message_en, message_zh, link_url) values ('a', 'b', '//evil.example')"),
    ).rejects.toThrow(/link_url/)
    await expect(
      db.query(
        "insert into public.site_announcements (message_en, message_zh, starts_at, ends_at) values ('a', 'b', now(), now() - interval '1 hour')",
      ),
    ).rejects.toThrow(/window_order/)
    await expect(saveAnnouncement(service, admin, draft({ linkUrl: 'javascript:alert(1)' }))).rejects.toMatchObject({ code: 'INVALID_INPUT' })
  })
})

describe('admin_activate_announcement', () => {
  it('switches on, and switching another overlapping one on stops the first in the same call', async () => {
    const first = await saveAnnouncement(service, admin, draft())
    expect(await setAnnouncementActive(service, admin, { id: first, active: true })).toEqual([])
    const second = await saveAnnouncement(service, admin, draft({ startsAt: iso(HOUR), endsAt: iso(2 * HOUR) }))
    expect(await setAnnouncementActive(service, admin, { id: second, active: true })).toEqual([first])
    expect(await activeRows()).toEqual([second])
  })

  it('keeps non-overlapping schedules active side by side and switches off', async () => {
    const now = await saveAnnouncement(service, admin, draft({ endsAt: iso(HOUR) }))
    const later = await saveAnnouncement(service, admin, draft({ startsAt: iso(HOUR), endsAt: iso(3 * HOUR) }))
    await setAnnouncementActive(service, admin, { id: now, active: true })
    expect(await setAnnouncementActive(service, admin, { id: later, active: true })).toEqual([])
    expect(await activeRows()).toEqual([now, later].sort())
    await setAnnouncementActive(service, admin, { id: now, active: false })
    expect(await activeRows()).toEqual([later])
  })

  it('refuses editing an active row into another active window (overlap)', async () => {
    const a = await saveAnnouncement(service, admin, draft({ endsAt: iso(HOUR) }))
    const b = await saveAnnouncement(service, admin, draft({ startsAt: iso(2 * HOUR) }))
    await setAnnouncementActive(service, admin, { id: a, active: true })
    await setAnnouncementActive(service, admin, { id: b, active: true })
    await expect(saveAnnouncement(service, admin, { ...draft({ startsAt: iso(30 * 60 * 1000) }), id: b })).rejects.toMatchObject({
      code: 'CONFLICT',
    })
    await expect(
      db.query('update public.site_announcements set is_active = true, starts_at = null, ends_at = null where id = $1', [a]),
    ).rejects.toThrow(/active_no_overlap/)
  })

  it('never leaves two active rows whose windows overlap', async () => {
    const ids = await Promise.all([0, 1, 2].map(() => saveAnnouncement(service, admin, draft())))
    await Promise.all(ids.map((id) => setAnnouncementActive(service, admin, { id, active: true })))
    expect(await activeRows()).toHaveLength(1)
  })

  it('records who switched it', async () => {
    const id = await saveAnnouncement(service, admin, draft())
    await setAnnouncementActive(service, admin, { id, active: true })
    const { rows } = await db.query('select updated_by from public.site_announcements where id = $1', [id])
    expect(rows[0]).toEqual({ updated_by: admin })
  })
})

describe('banner read', () => {
  it('follows the schedule and the visitor language', async () => {
    const ended = await saveAnnouncement(service, admin, draft({ messageEn: 'ended', startsAt: iso(-3 * HOUR), endsAt: iso(-2 * HOUR) }))
    const live = await saveAnnouncement(service, admin, draft({ messageEn: 'live', messageZh: '进行中', startsAt: iso(-HOUR), endsAt: iso(HOUR) }))
    const next = await saveAnnouncement(service, admin, draft({ messageEn: 'next', startsAt: iso(HOUR), endsAt: null }))
    for (const id of [ended, live, next]) await setAnnouncementActive(service, admin, { id, active: true })

    const rows = await loadBannerCandidates(service, new Date())
    expect(rows.map((row) => row.id)).toEqual([live, next])
    const en = rows.map((row) => localize(row, 'en'))
    const zh = rows.map((row) => localize(row, 'zh'))
    expect(pickLive(en, Date.now())?.message).toBe('live')
    expect(pickLive(zh, Date.now())?.message).toBe('进行中')
    expect(pickLive(en, Date.now() + 2 * HOUR)?.message).toBe('next')
  })

  it('shows nothing when no announcement is active', async () => {
    await saveAnnouncement(service, admin, draft())
    expect(await loadBannerCandidates(service, new Date())).toEqual([])
  })
})
