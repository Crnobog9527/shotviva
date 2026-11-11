import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

// Every promoter slug (affiliates.slug), so the source table can tell a real promoter link from
// another site's ?ref= (Product Hunt and AI directories add their own). Slugs only, no person.
// The table is small (one row per promoter); read whole.
const rows = z.array(z.object({ slug: z.string().regex(/^[a-z0-9-]{3,24}$/) }))
const MAX = 5000

export async function loadPromoterSlugs(db: SupabaseClient): Promise<string[]> {
  const { data, error } = await db.from('affiliates').select('slug').limit(MAX)
  if (error) throw new Error(`affiliates read failed: ${error.code ?? 'unknown'}`)
  return rows.parse(data).map((row) => row.slug).sort()
}
