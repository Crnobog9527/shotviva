import 'server-only'

import { createAdminSupabase } from '../../auth/supabase-admin'
import { logger } from '../../logger'
import type { VitalReport } from './fields'
import { countryOf, MAX_VITALS_BODY, parseVitalReport } from './schema'

export type VitalRow = {
  metric: string
  value: number
  rating: string
  route: string
  locale: string
  nav_type: string
  standalone: boolean
  sw: boolean
  effective_type: string | null
  country: string | null
}

export type InsertVital = (row: VitalRow) => Promise<void>

const insertWithServiceRole: InsertVital = async (row) => {
  const { error } = await createAdminSupabase().from('web_vitals').insert(row)
  if (error) throw new Error(error.code ?? 'insert failed')
}

export const toRow = (report: VitalReport, country: string | null): VitalRow => ({
  metric: report.metric,
  value: report.value,
  rating: report.rating,
  route: report.route,
  locale: report.locale,
  nav_type: report.nav,
  standalone: report.standalone,
  sw: report.sw,
  effective_type: report.net,
  country,
})

// The body as text, or null when it is larger than any real report. The declared length is
// checked first so a large body is never read; the read length is checked too (chunked bodies
// declare none).
async function readSmallBody(request: Request): Promise<string | null> {
  const declared = Number(request.headers.get('content-length') ?? '0')
  if (!Number.isFinite(declared) || declared > MAX_VITALS_BODY) return null
  const text = await request.text()
  return text.length > MAX_VITALS_BODY ? null : text
}

function parseBody(text: string): VitalReport | null {
  try {
    return parseVitalReport(JSON.parse(text))
  } catch {
    return null
  }
}

// POST /api/vitals. Reads the body and the country header, nothing else: no cookie, no session,
// no IP, no user agent. Answers 204 whatever happens, so a report never learns anything back.
export async function handleVitals(request: Request, insert: InsertVital = insertWithServiceRole): Promise<Response> {
  try {
    const text = await readSmallBody(request)
    const report = text === null ? null : parseBody(text)
    if (report) await insert(toRow(report, countryOf(request.headers.get('x-vercel-ip-country'))))
  } catch (error) {
    logger.warn('web vitals report not stored', { error: error instanceof Error ? error.message : 'unknown' })
  }
  return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } })
}
