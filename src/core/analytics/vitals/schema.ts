import { z } from 'zod'

import {
  MAX_VITAL_CLS,
  MAX_VITAL_MS,
  VITAL_EFFECTIVE_TYPES,
  VITAL_LOCALES,
  VITAL_METRICS,
  VITAL_NAV_TYPES,
  VITAL_RATINGS,
  VITAL_ROUTES,
  type VitalReport,
} from './fields'

// The largest body /api/vitals reads. A real report is about 170 bytes.
export const MAX_VITALS_BODY = 1024

// Strict: a key outside these is a rejected report, not a dropped key, so nothing new can ride
// along without a code change.
const reportSchema = z
  .strictObject({
    metric: z.enum(VITAL_METRICS),
    value: z.number().finite().min(0),
    rating: z.enum(VITAL_RATINGS),
    route: z.enum(VITAL_ROUTES),
    locale: z.enum(VITAL_LOCALES),
    nav: z.enum(VITAL_NAV_TYPES),
    standalone: z.boolean(),
    sw: z.boolean(),
    net: z.enum(VITAL_EFFECTIVE_TYPES).nullable(),
  })
  .refine((r) => r.value <= (r.metric === 'CLS' ? MAX_VITAL_CLS : MAX_VITAL_MS))

export function parseVitalReport(input: unknown): VitalReport | null {
  const parsed = reportSchema.safeParse(input)
  return parsed.success ? parsed.data : null
}

// Vercel's two-letter visitor country; anything else (missing, "XX", junk) is no country.
export function countryOf(header: string | null): string | null {
  const code = header?.trim().toUpperCase() ?? ''
  return /^[A-Z]{2}$/.test(code) && code !== 'XX' ? code : null
}
