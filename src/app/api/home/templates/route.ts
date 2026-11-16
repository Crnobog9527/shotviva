import { unstable_rethrow } from 'next/navigation'
import { z } from 'zod'

import { LOCALES } from '@/core/i18n'
import { logger } from '@/core/logger'
import { loadHomeCatalogue } from '@/modules/image'

const localeSchema = z.enum(LOCALES)

export async function GET(request: Request) {
  const locale = localeSchema.safeParse(new URL(request.url).searchParams.get('locale'))
  if (!locale.success) return Response.json({ code: 'INVALID_INPUT' }, { status: 400 })

  try {
    return Response.json(await loadHomeCatalogue(locale.data), { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    unstable_rethrow(error)
    logger.error('home.catalogue_read_failed', { error })
    return Response.json({ code: 'INTERNAL' }, { status: 503 })
  }
}
