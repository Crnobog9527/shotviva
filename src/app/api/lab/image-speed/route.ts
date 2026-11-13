import { connection } from 'next/server'

import { serverEnv } from '@/core/env'
import { labOrigins, labPageHtml, pickKeys } from '@/core/lab/image-speed'
import { NOINDEX_HEADER } from '@/core/seo'
import { cachedWebCatalogue } from '@/core/templates/cached-catalogue'

// Public on purpose (AGENTS §6): a measuring page the Owner opens on mainland phones to compare
// how fast covers load from each origin (no sign-in on a borrowed phone). It reads only the
// public catalogue's cover URLs (cached), writes nothing and sends no user data anywhere.
// Lives under /api so the locale router leaves it alone; noindex, never cached.
export async function GET() {
  await connection()
  const env = serverEnv()
  const base = env.NEXT_PUBLIC_ASSETS_BASE_URL
  const templates = base ? await cachedWebCatalogue('zh') : []
  const keys = base ? pickKeys(templates.map((t) => t.coverAfterUrl ?? t.coverBeforeUrl), base) : []
  const origins = labOrigins({ assetsBase: base, r2Origin: env.R2_PUBLIC_ORIGIN })
  return new Response(labPageHtml({ origins, keys }), {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      [NOINDEX_HEADER.key]: NOINDEX_HEADER.value,
    },
  })
}
