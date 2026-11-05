import type { AdminAnnouncementRow, AnnouncementTone } from '@/core/announcements/rules'

import { beijingLocalToIso, formatBeijing, toBeijingLocal } from '../shell/format'

export type AnnouncementForm = {
  messageEn: string
  messageZh: string
  linkUrl: string
  linkLabelEn: string
  linkLabelZh: string
  tone: AnnouncementTone
  // datetime-local values in the admin's browser time; '' = open-ended.
  startsAt: string
  endsAt: string
}

// datetime-local carries no zone; the form labels say Beijing time and it is read as UTC+8.
export const toIso = beijingLocalToIso
export const toLocal = (iso: string | null) => (iso ? toBeijingLocal(iso) : '')
export { formatBeijing }

export function emptyForm(): AnnouncementForm {
  return { messageEn: '', messageZh: '', linkUrl: '', linkLabelEn: '', linkLabelZh: '', tone: 'info', startsAt: '', endsAt: '' }
}

export function toForm(row: AdminAnnouncementRow): AnnouncementForm {
  return {
    messageEn: row.message_en,
    messageZh: row.message_zh,
    linkUrl: row.link_url ?? '',
    linkLabelEn: row.link_label_en ?? '',
    linkLabelZh: row.link_label_zh ?? '',
    tone: row.tone,
    startsAt: toLocal(row.starts_at),
    endsAt: toLocal(row.ends_at),
  }
}

export function toSaveInput(form: AnnouncementForm, id: string | undefined) {
  return { ...form, id, startsAt: toIso(form.startsAt), endsAt: toIso(form.endsAt) }
}

type Window = Pick<AdminAnnouncementRow, 'starts_at' | 'ends_at'>
const lower = (w: Window) => (w.starts_at ? Date.parse(w.starts_at) : -Infinity)
const upper = (w: Window) => (w.ends_at ? Date.parse(w.ends_at) : Infinity)

// Same rule as the database's tstzrange && on [starts_at, ends_at).
export function overlaps(a: Window, b: Window): boolean {
  return lower(a) < upper(b) && lower(b) < upper(a)
}

// What switching `target` on will switch off, among the rows on screen.
export function wouldStop(target: AdminAnnouncementRow, rows: readonly AdminAnnouncementRow[]): AdminAnnouncementRow[] {
  return rows.filter((row) => row.is_active && row.id !== target.id && overlaps(row, target))
}

export type AnnouncementStatus = 'live' | 'scheduled' | 'ended' | 'off'

export function statusOf(row: AdminAnnouncementRow, now: number): AnnouncementStatus {
  if (!row.is_active) return 'off'
  if (upper(row) <= now) return 'ended'
  return lower(row) > now ? 'scheduled' : 'live'
}
