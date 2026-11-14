import { z } from 'zod'
import { errorResponse } from '@/core/api-response'
import { exportCommissions } from '@/core/affiliate/partners/csv'

export async function GET(request: Request) {
  const locale = z.enum(['en', 'zh']).catch('en').parse(new URL(request.url).searchParams.get('locale'))
  try {
    return await exportCommissions(locale)
  } catch (error) {
    return errorResponse(error, '/api/affiliate/commissions')
  }
}
