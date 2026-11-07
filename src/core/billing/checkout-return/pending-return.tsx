import { useTranslations } from 'next-intl'

import { Link } from '../../i18n/ui'
import { buttonVariants } from '../../ui/button'
import { Glyph, ReturnPlate, Row, Rows, fineClass, subClass, titleClass } from './parts'
import { useChargedMoney } from './use-money'
import type { PendingView } from './view-model'

// `wechatPay`: STRIPE_WECHAT_PAY (T73). The wallet line's session says only `alipay` until the
// payment lands, so with WeChat Pay on the copy names both wallets.
type Props = { view: PendingView; again: string; email: string; wechatPay: boolean }

function pendingKey(method: PendingView['method'], wechatPay: boolean): string {
  if (method === 'wechat_pay' || (method === 'alipay' && wechatPay)) return 'subPendingWallet'
  return method === 'alipay' ? 'subPendingAlipay' : 'subPending'
}

// Paid, but the credits are not in yet (comps-v3-b checkout.html `?r=pending`): Alipay still
// confirming, or the webhook a moment behind. Nothing polls; "Check again" reloads this page.
export function PendingReturn({ view, again, email, wechatPay }: Props) {
  const t = useTranslations('app.checkout')
  const tiers = useTranslations('paywall.tiers')
  const money = useChargedMoney()
  const order = view.tier
    ? t('orderPlan', { tier: tiers(view.tier), period: view.interval ?? 'month', count: view.credits })
    : t('orderPack', { count: view.credits })
  return (
    <ReturnPlate pending>
      <Glyph pending />
      <h1 className={titleClass}>{t('titlePending')}</h1>
      <p className={subClass}>{t(pendingKey(view.method, wechatPay))}</p>
      <Rows>
        <Row label={t('order')}>{order}</Row>
        {view.amount ? <Row label={t('amount')}>{money(view.amount)}</Row> : null}
      </Rows>
      <div className="mt-6 grid gap-2">
        <a href={again} className={buttonVariants({ variant: 'glass', size: 'cta', className: 'w-full rounded-control text-body' })}>
          {t('checkAgain')}
        </a>
        <Link href="/generate" className="inline-flex min-h-11 items-center justify-center text-label font-medium text-bone-dim hover:text-foreground">
          {t('backToCreate')}
        </Link>
      </div>
      <p className={fineClass}>{t('finePending', { email })}</p>
    </ReturnPlate>
  )
}
