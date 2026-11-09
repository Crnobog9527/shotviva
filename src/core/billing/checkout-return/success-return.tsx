import { useTranslations } from 'next-intl'

import { Link } from '../../i18n/ui'
import { buttonVariants } from '../../ui/button'
import { CelebrationLoader } from './celebration/loader'
import { levelOf, plateMaterial } from './celebration/levels'
import { Credits, Glyph, ReturnPlate, Row, Rows, fineClass, linkClass, subClass, titleClass } from './parts'
import { useChargedMoney } from './use-money'
import { brandName, type SuccessView } from './view-model'

type Props = { view: SuccessView; back: string | null }

// Paid and the credits are in (comps-v3-b checkout.html `?r=success`): what you now have, then
// one action. The receipt is Stripe's hosted one; Waffo has none. The first time a payment
// lands here it is celebrated, by tier (T55); the pending state never is.
export function SuccessReturn({ view, back }: Props) {
  const t = useTranslations('app.checkout')
  const tiers = useTranslations('paywall.tiers')
  const money = useChargedMoney()
  const count = view.credits?.toLocaleString()
  const level = levelOf(view.productId)
  return (
    <ReturnPlate pending={false} material={plateMaterial(level)}>
      <CelebrationLoader level={level} paymentKey={view.paymentKey} />
      <Glyph pending={false} />
      <h1 data-title="" className={titleClass}>{view.tier ? t('titlePlan', { tier: tiers(view.tier) }) : view.credits === null ? t('packPaid') : t('titlePack', { count: view.credits })}</h1>
      <p className={subClass}>{view.kind === 'plan' && view.credits !== null ? t('subPlan', { count: view.credits }) : t('subPack')}</p>
      <Rows>
        {view.credits !== null ? <Row label={t('added')}>
          <Credits count={`+${count}`} unit={t('unit')} added={view.credits} />
        </Row> : null}
        <Row label={t('balance')}>
          <Credits count={view.balance.toLocaleString()} unit={t('unit')} />
        </Row>
        {view.renews ? (
          <Row label={t('renews')}>
            {t('renewsDate', { date: new Date(view.renews.at) })}
          </Row>
        ) : null}
        {view.paid ? <Row label={t('paid')}>{paidLine(t, money(view.paid), view.paid)}</Row> : null}
      </Rows>
      <Link href="/generate" className={buttonVariants({ variant: 'cta', size: 'cta', className: 'mt-6' })}>
        {t('start')}
      </Link>
      <SuccessLinks receiptUrl={view.receiptUrl} back={back} />
      <p className={fineClass}>{t(view.fine, { period: view.interval ?? 'month' })}</p>
    </ReturnPlate>
  )
}

function paidLine(t: ReturnType<typeof useTranslations<'app.checkout'>>, amount: string, paid: NonNullable<SuccessView['paid']>): string {
  if (paid.card) return t('paidCard', { amount, brand: brandName(paid.card.brand), last4: paid.card.last4 })
  if (paid.method) return t('paidMethod', { amount, method: paid.method })
  return amount
}

function SuccessLinks({ receiptUrl, back }: { receiptUrl: string | null; back: string | null }) {
  const t = useTranslations('app.checkout')
  return (
    <div className="mt-4 flex flex-wrap justify-center gap-x-6 gap-y-1">
      {receiptUrl ? (
        <a href={receiptUrl} target="_blank" rel="noopener noreferrer" className={linkClass}>
          <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 4H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9z" />
            <path d="M14 4v5h5M9 13h6M9 17h6" />
          </svg>
          {t('receipt')}
        </a>
      ) : null}
      <Link href="/account" className={linkClass}>
        <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
          <circle cx="12" cy="8.5" r="3.8" />
          <path d="M4.5 20c1.2-3.6 4-5.3 7.5-5.3s6.3 1.7 7.5 5.3" />
        </svg>
        {t('manage')}
      </Link>
      {back ? (
        <a href={back} className={linkClass}>
          {t('backToPartner')}
          <span aria-hidden="true" className="text-primary">
            →
          </span>
        </a>
      ) : null}
    </div>
  )
}
