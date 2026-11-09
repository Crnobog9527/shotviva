import type { Locale } from '@/core/i18n'
import type { Translate } from '@/core/translate'
import type { Query } from './models'

export const money = (locale: Locale, cents: number) =>
  new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD', currencyDisplay: 'narrowSymbol' }).format(
    cents / 100,
  )
export const date = (locale: Locale, iso: string) =>
  new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(iso))
export const percent = (locale: Locale, bp: number) =>
  new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 2 }).format(bp / 10000)

export function viewHref(query: Partial<Query>) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) if (value) params.set(key, value)
  return '/partners' + (params.size ? '?' + params.toString() : '')
}

export function productLabel(id: string, t: Translate) {
  const key = 'product.' + id
  return t.has(key) ? t(key) : id
}
