import type { Locale } from '../i18n/locales'
import type { WishNotice } from './notices'

// What the "your wish came true" banner needs of one notice (ARCHITECTURE §15.4). The name is
// picked on the server for the page's language, so the browser gets one name, not both.
export type NoticeItem = {
  requestId: string
  templateId: string
  templateName: string
  isAuthor: boolean
}

export function toNoticeItems(notices: readonly WishNotice[], locale: Locale): NoticeItem[] {
  return notices.map((notice) => ({
    requestId: notice.request_id,
    templateId: notice.template_id,
    // The SQL already falls back to English for a missing Chinese name; this only guards blanks.
    templateName: (locale === 'zh' ? notice.template_name_zh : notice.template_name_en) || notice.template_name_en,
    isAuthor: notice.is_author,
  }))
}

// The banner steps through the unread notices newest first: closing one shows the next, and
// closing the last one (or "Try it") ends it. null means the banner is gone.
export function afterDismiss(index: number | null, count: number): number | null {
  if (index === null) return null
  return index + 1 < count ? index + 1 : null
}
