import { getTranslations } from 'next-intl/server'
import { z } from 'zod'

import { errorResponse, jsonResponse } from '@/core/api-response'
import { createAdminSupabase, createServerSupabase, requireApiUser } from '@/core/auth'
import { AppError } from '@/core/errors'
import { isLocale } from '@/core/i18n'
import { currentLocale } from '@/core/i18n/server'
import { r2Store } from '@/core/storage'
import { loadWorkView } from '@/modules/image'
import { site } from '@/site/site.config'

const params = z.object({ jobId: z.uuid() })

// GET → one of the caller's finished works as the Photos viewer shows it (no image bytes, only
// the file routes), in ?locale= (the page's language). Signed-in only; someone else's,
// unfinished or deleted works are a 404.
export async function GET(request: Request, ctx: RouteContext<'/api/photos/[jobId]'>) {
  try {
    const user = await requireApiUser()
    const parsed = params.safeParse(await ctx.params)
    if (!parsed.success) throw new AppError('NOT_FOUND', 'Not found')
    const asked = new URL(request.url).searchParams.get('locale')
    const locale = isLocale(asked) ? asked : await currentLocale()
    const t = await getTranslations({ locale, namespace: 'app.result' })
    const shareText = t('shareText', { brand: site.brand.name, url: `https://${site.brand.domain}/?utm_source=share&utm_medium=web_share` })
    const deps = { db: await createServerSupabase(), admin: createAdminSupabase(), store: r2Store, locale, shareText }
    const view = await loadWorkView(deps, { userId: user.id, jobId: parsed.data.jobId })
    if (!view) throw new AppError('NOT_FOUND', 'Not found')
    return jsonResponse(view)
  } catch (error) {
    return errorResponse(error, 'photos.view')
  }
}
