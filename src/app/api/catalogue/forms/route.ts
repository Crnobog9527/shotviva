import type { NextRequest } from 'next/server'
import { z } from 'zod'

import { errorResponse, jsonResponse } from '@/core/api-response'
import { requireApiUser } from '@/core/auth'
import { AppError } from '@/core/errors'
import { isLocale } from '@/core/i18n/locales'
import { loadCatalogueForms } from '@/modules/image'

const formIds = z.array(z.string().min(1).max(200)).min(1).max(30)

export async function GET(request: NextRequest) {
  try {
    await requireApiUser()
    const query = request.nextUrl.searchParams
    const locale = query.get('locale')
    const ids = formIds.safeParse(query.getAll('id'))
    if (!isLocale(locale) || !ids.success) throw new AppError('INVALID_INPUT', 'Invalid template selection')
    return jsonResponse(await loadCatalogueForms(locale, ids.data))
  } catch (error) {
    return errorResponse(error, 'catalogue.forms')
  }
}
