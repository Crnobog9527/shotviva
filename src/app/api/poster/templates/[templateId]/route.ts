import type { NextRequest } from 'next/server'

import { errorResponse, jsonResponse } from '@/core/api-response'
import { createAdminSupabase, requireApiUser } from '@/core/auth'
import { AppError } from '@/core/errors'
import { DEFAULT_LOCALE, isLocale } from '@/core/i18n/locales'
import { loadStudioTemplate, posterAllowed } from '@/modules/image/posters'

// GET ?locale=zh → 200 StudioTemplate. What the poster editor needs of one template (its kinds,
// the sizes its bound model accepts, the tiers it sells and their prices), read when the editor
// opens as a dialog on Create (ARCHITECTURE §5.3). Signed-in accounts the dense_poster feature
// allows; prompts never leave the server.
export async function GET(request: NextRequest, { params }: RouteContext<'/api/poster/templates/[templateId]'>) {
  try {
    const user = await requireApiUser()
    if (!(await posterAllowed(user.id))) throw new AppError('FORBIDDEN', 'Posters are not open to this account')
    const { templateId } = await params
    const asked = request.nextUrl.searchParams.get('locale')
    const template = await loadStudioTemplate(createAdminSupabase(), isLocale(asked) ? asked : DEFAULT_LOCALE, templateId)
    if (!template) throw new AppError('NOT_FOUND', 'No such poster template')
    return jsonResponse(template)
  } catch (error) {
    return errorResponse(error, 'poster.template')
  }
}
