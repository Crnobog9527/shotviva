import { getTranslations } from 'next-intl/server'
import { z } from 'zod'

import { errorResponse } from '@/core/api-response'
import { createAdminSupabase, requireApiUser } from '@/core/auth'
import { maskPhone } from '@/core/auth/phone'
import { buildOrgReport, resolvePeriod, type ReportLabels } from '@/core/org/report'

// GET /api/account/enterprise/report?month=YYYY-MM&kind=members|customers&locale=en|zh — the org
// owner's monthly performance CSV (ARCHITECTURE §6.5, card E5). A signed-in account that owns no
// org gets the plain 404; staff never reach it.
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const locale = z.enum(['en', 'zh']).catch('en').parse(params.get('locale'))
  const kind = z.enum(['members', 'customers']).catch('members').parse(params.get('kind'))
  try {
    const user = await requireApiUser()
    const t = await getTranslations({ locale, namespace: 'app.org.report' })
    const labels: ReportLabels = {
      members: {
        member: t('member'), role: t('role'), status: t('status'), allocated: t('allocated'), used: t('used'),
        l1Signups: t('l1Signups'), l1Paying: t('l1Paying'), l1Paid: t('l1Paid'),
        l2Signups: t('l2Signups'), l2Paying: t('l2Paying'), l2Paid: t('l2Paid'),
      },
      customers: { member: t('member'), level: t('level'), contact: t('contact'), signedUp: t('signedUp'), paidInPeriod: t('paidInPeriod'), paidTotal: t('paidTotal') },
      total: t('total'), owner: t('owner'), staff: t('staff'), active: t('active'), removed: t('removed'), unknown: t('unknown'),
    }
    const { filename, body } = await buildOrgReport({ db: createAdminSupabase(), user: user.id, period: resolvePeriod(params.get('month'), new Date()), kind, labels, maskPhone })
    return new Response(body, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'private, no-store',
        'X-Robots-Tag': 'noindex',
      },
    })
  } catch (error) {
    return errorResponse(error, '/api/account/enterprise/report')
  }
}
