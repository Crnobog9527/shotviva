import type { Locale } from '../../i18n/locales'

// "November 30, 2026" / "2026年11月30日". UTC, so the day does not move with the server's zone.
export function longDate(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-US', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(iso))
}

export const isoDay = (iso: string) => iso.slice(0, 10)
