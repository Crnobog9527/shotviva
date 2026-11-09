import { useFormatter, useLocale, useTranslations } from 'next-intl'

import { percentZh } from '../../codes'
import type { readPendingDiscount } from '../../codes/server'

export type PendingDiscount = NonNullable<Awaited<ReturnType<typeof readPendingDiscount>>>

export function DiscountSummary({ value }: { value: PendingDiscount }) {
  const t = useTranslations('app.accountCodes.discount')
  const locale = useLocale()
  const format = useFormatter()
  const percent = locale === 'zh' ? percentZh(value.percent) : String(value.percent)
  const labels = value.products.map(id => t(`products.${id}`))
  const targets = new Intl.ListFormat(locale, { style: 'short', type: 'conjunction' }).format(labels)
  return (
    <div className="border-t border-hairline pt-3">
      <p className="text-label font-medium">{t('current', { code: value.code, percent })}</p>
      <p className="mt-1 text-caption text-muted-foreground">
        {targets}{' · '}{t(value.products.every(id => id.startsWith('pack_')) ? 'oneTime' : value.duration, { months: value.months ?? 0 })}
        {value.expiresAt && ' · ' + t('expires', { date: format.dateTime(new Date(value.expiresAt), { dateStyle: 'medium' }) })}
      </p>
    </div>
  )
}
