import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

// The accounts' own first-touch rows (ARCHITECTURE §16.6, account_first_touch, 1546) for the
// 「落地页」 and 「来源网站 / utm」 tables. Read by primary key, a page of ids at a time (the ids stay
// on the server).

const PAGE = 150

const rowSchema = z.object({
  user_id: z.uuid(),
  landing_path: z.string(),
  referrer_host: z.string().nullable(),
  utm_source: z.string().nullable(),
  utm_medium: z.string().nullable(),
  utm_campaign: z.string().nullable(),
})

export type OwnTouch = { landing: string; refHost: string | null; utmSource: string | null; utmMedium: string | null; utmCampaign: string | null }
// Plain object so it survives the 'use cache' round trip.
export type OwnTouches = Record<string, OwnTouch>

export async function loadOwnTouches(db: SupabaseClient, userIds: readonly string[]): Promise<OwnTouches> {
  const result: OwnTouches = {}
  for (let i = 0; i < userIds.length; i += PAGE) {
    const { data, error } = await db
      .from('account_first_touch')
      .select('user_id, landing_path, referrer_host, utm_source, utm_medium, utm_campaign')
      .in('user_id', userIds.slice(i, i + PAGE))
    if (error) throw new Error(`account_first_touch read failed: ${error.message}`)
    for (const row of rowSchema.array().parse(data)) {
      result[row.user_id] = { landing: row.landing_path, refHost: row.referrer_host, utmSource: row.utm_source, utmMedium: row.utm_medium, utmCampaign: row.utm_campaign }
    }
  }
  return result
}
