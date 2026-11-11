import { versionKey } from './dismissal'
import type { AnnouncementRow, BannerAnnouncement, BannerLocale } from './types'

// Pure rules shared by the admin form, the server read and the banner (ARCHITECTURE §10).

export const MESSAGE_MAX = 140
export const LINK_LABEL_MAX = 40
export const RESHOW_DAYS_MAX = 365

// A site path ("/pricing") or an https URL without userinfo, matching the table's check.
// Protocol-relative "//host" is an off-site link dressed as a path, so it is refused.
export function isAllowedLink(url: string): boolean {
  if (url.startsWith('/')) return !url.startsWith('//') && !/\s/.test(url)
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' && parsed.hostname.length > 0 && !parsed.username && !parsed.password && !/\s/.test(url)
  } catch {
    return false
  }
}

type Window = Pick<BannerAnnouncement, 'startsAt' | 'endsAt'>

// Live means started (or no start) and not yet ended (or no end): [starts_at, ends_at).
export function isLive(item: Window, now: number): boolean {
  const started = item.startsAt === null || Date.parse(item.startsAt) <= now
  const notEnded = item.endsAt === null || Date.parse(item.endsAt) > now
  return started && notEnded
}

// The database keeps active windows from overlapping, so at most one is live; the first match
// is taken either way.
export function pickLive<T extends Window>(items: readonly T[], now: number): T | null {
  return items.find((item) => isLive(item, now)) ?? null
}

export function localize(row: AnnouncementRow, locale: BannerLocale): BannerAnnouncement {
  const zh = locale === 'zh'
  const label = zh ? row.link_label_zh : row.link_label_en
  const message = zh ? row.message_zh : row.message_en
  const link = row.link_url ? { url: row.link_url, label: label ?? null } : null
  return {
    id: row.id,
    message,
    link,
    tone: row.tone,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    closeKey: row.dismissible ? versionKey(row.id, { message, link, tone: row.tone }) : null,
    reshowAfterDays: row.reshow_after_days,
  }
}

// Admin, checkout and anything under them never show the banner; a /zh prefix is ignored.
const HIDDEN = [/^\/admin(\/|$)/, /^\/checkout(\/|$)/]

export function isBannerHiddenPath(pathname: string): boolean {
  const path = pathname.replace(/^\/zh(?=\/|$)/, '') || '/'
  return HIDDEN.some((pattern) => pattern.test(path))
}
