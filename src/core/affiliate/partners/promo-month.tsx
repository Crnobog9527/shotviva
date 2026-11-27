import 'server-only'
import { getTranslations } from 'next-intl/server'
import { z } from 'zod'
import { createAdminSupabase } from '@/core/auth'
import { logger } from '@/core/logger'
import type { Locale } from '@/core/i18n'

// This month's promotion credits of a channel partner (ARCHITECTURE §6.5 渠道商推广积分), read-only
// on the owner's enterprise dashboard. The page has already checked that the signed-in account is
// the org's affiliate account; org_promo_month (migration 1849) is service-role only.
const promoMonthSchema = z.object({
  promo_partner: z.boolean(),
  period: z.string(),
  monthly: z.coerce.number().int(),
  topups: z.coerce.number().int(),
  expires_at: z.string().nullable(),
  remaining: z.coerce.number().int(),
})
export type PromoMonth = z.infer<typeof promoMonthSchema>

// A read that fails hides the card instead of failing the whole dashboard.
export async function readPromoMonth(orgId: string): Promise<PromoMonth | null> {
  const { data, error } = await createAdminSupabase().rpc('org_promo_month', { p_org: orgId })
  const parsed = z.array(promoMonthSchema).safeParse(data ?? [])
  if (error || !parsed.success) {
    logger.warn('promotion credits unavailable', { code: error?.code })
    return null
  }
  return parsed.data[0] ?? null
}

// The last moment before the month-end expiry, as a date: credits valid "through" that day.
const lastDay = (locale: Locale, iso: string) =>
  new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(new Date(iso).getTime() - 1))

/** Shown only to channel partners, or to an org that got credits this month. */
export async function PromoMonthCard({ orgId, locale }: { orgId: string; locale: Locale }) {
  const month = await readPromoMonth(orgId)
  if (!month || (!month.promo_partner && month.monthly + month.topups === 0)) return null
  const t = await getTranslations('affiliate.enterprise.promo')
  const n = (value: number) => new Intl.NumberFormat(locale).format(value)
  const granted = month.monthly + month.topups
  return (
    <section className="af-panel af-promo" aria-labelledby="af-promo">
      <h2 id="af-promo">{t('title')}</h2>
      {granted === 0 ? (
        <p className="af-hint">{t('none')}</p>
      ) : (
        <>
          <dl className="af-balance-facts af-promo-facts">
            <div>
              <dt>{t('granted')}</dt>
              <dd className="af-num">{n(granted)}</dd>
            </div>
            <div>
              <dt>{t('remaining')}</dt>
              <dd className="af-num">{n(month.remaining)}</dd>
            </div>
            <div>
              <dt>{t('monthly')}</dt>
              <dd className="af-num">{n(month.monthly)}</dd>
            </div>
            <div>
              <dt>{t('topups')}</dt>
              <dd className="af-num">{n(month.topups)}</dd>
            </div>
            {month.expires_at ? (
              <div>
                <dt>{t('validThrough')}</dt>
                <dd>{lastDay(locale, month.expires_at)}</dd>
              </div>
            ) : null}
          </dl>
          <p className="af-hint">{t('note')}</p>
        </>
      )}
    </section>
  )
}
