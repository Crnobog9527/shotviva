// site_announcements (ARCHITECTURE §10). Text lives in the table's en / zh columns, never in
// site/messages, so the Owner changes it without a deploy.

export type AnnouncementTone = 'info' | 'promo'
export type BannerLocale = 'en' | 'zh'

export type AnnouncementRow = {
  id: string
  message_en: string
  message_zh: string
  link_url: string | null
  link_label_en: string | null
  link_label_zh: string | null
  tone: AnnouncementTone
  starts_at: string | null
  ends_at: string | null
  // Close rule (ARCHITECTURE §10「关闭规则」): no ✕ when not dismissible; a closed banner comes
  // back after reshow_after_days, or only when its content changes when that is null.
  dismissible: boolean
  reshow_after_days: number | null
}

export type AdminAnnouncementRow = AnnouncementRow & {
  is_active: boolean
  created_at: string
  updated_at: string
}

// What the banner renders: one language, already picked on the server.
export type BannerAnnouncement = {
  id: string
  message: string
  link: { url: string; label: string | null } | null
  tone: AnnouncementTone
  startsAt: string | null
  endsAt: string | null
  // This version's key in the browser's closed list (dismissal.ts), or null when it cannot be
  // closed.
  closeKey: string | null
  reshowAfterDays: number | null
}
