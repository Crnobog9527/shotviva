'use client'

import { useFormatter } from 'next-intl'

import { useTimeZone } from '../detail/use-time-zone'

// "28 Oct" in the viewer's own zone; until the zone is known (server render, hydration) the UTC
// date, which is the same on both sides (as PhotoWhen does on the photo page).
export function ShortDay({ iso }: { iso: string }) {
  const format = useFormatter()
  const timeZone = useTimeZone() ?? 'UTC'
  return <time dateTime={iso}>{format.dateTime(new Date(iso), { month: 'short', day: 'numeric', timeZone })}</time>
}
