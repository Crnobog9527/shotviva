'use client'

import { useFormatter, useTranslations } from 'next-intl'

import { dayLabel } from './photo-detail'
import { useTimeZone } from './use-time-zone'

// When the photo was made, in the viewer's own zone: "Today 14:05" in the meta line, "Today,
// 14:05" in the facts. Until the zone is known (server render, hydration) it shows the date
// alone, in UTC, which is the same on both sides.
export function PhotoWhen({ iso, variant }: { iso: string; variant: 'meta' | 'made' }) {
  const t = useTranslations('app.result.when')
  const format = useFormatter()
  const timeZone = useTimeZone()
  const created = new Date(iso)
  if (!timeZone) return <time dateTime={iso}>{format.dateTime(created, { month: 'short', day: 'numeric', timeZone: 'UTC' })}</time>
  const day = dayLabel(created, new Date(), timeZone, t, (date) => format.dateTime(date, { month: 'short', day: 'numeric', timeZone }))
  const time = format.dateTime(created, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone })
  return <time dateTime={iso}>{t(variant, { day, time })}</time>
}
