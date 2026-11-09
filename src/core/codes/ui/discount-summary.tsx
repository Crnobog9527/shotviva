import { useFormatter, useLocale, useTranslations } from 'next-intl'

import { percentZh } from '../index'
import type { PendingDiscount } from '../index'

export function DiscountSummary({ value, singlePayment = false }: { value: PendingDiscount; singlePayment?: boolean }) {
  const t = useTranslations('app.accountCodes.discount')
  const locale = useLocale()
  const format = useFormatter()
  const percent = locale === 'zh' ? percentZh(value.percent) : String(value.percent)
  const labels = value.products.map(id => t(`products.${id}`))
  const targets = new Intl.ListFormat(locale, { style: 'short', type: 'conjunction' }).format(labels)
  return (
    <div className="space-y-1">
      <p className="text-label font-medium">{t('current', { code: value.code, percent })}</p>
      <p className="mt-1 text-caption text-muted-foreground">
        {targets}{' · '}{t(singlePayment || value.products.every(id => id.startsWith('pack_')) ? 'oneTime' : value.duration, { months: value.months ?? 0 })}
        {!singlePayment && value.products.some(id => id.startsWith('pack_')) && value.products.some(id => !id.startsWith('pack_')) && ' · ' + t('packsOnce')}
        {value.expiresAt && ' · ' + t('expires', { date: format.dateTime(new Date(value.expiresAt), { dateStyle: 'medium' }) })}
      </p>
    </div>
  )
}
