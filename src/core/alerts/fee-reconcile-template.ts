import type { FeeReconcileIssue, PaymentFeeReconcileAlert } from './alert-kinds'

// F4 (ARCHITECTURE §6.2 订单手续费 · 对账): the Owner's copy for one reconciliation run's findings.

const FEE_NAMES: Record<string, string> = {
  acquiring: '收单费', intl_card: '国际卡附加', fx: '换汇', mp: 'Managed Payments 3.5%', billing: '订阅费 0.7%',
  radar: '风控 Radar', refund_fee: '退款手续费',
}
const CHANNEL_NAMES: Record<string, string> = { stripe: 'Stripe', waffo: 'Waffo' }
const dollars = (cents: number | null) => `$${((cents ?? 0) / 100).toFixed(2)}`

type Named = FeeReconcileIssue & { channelName: string; feeName: string }

const LINES: Record<FeeReconcileIssue['issue'], (item: Named) => string> = {
  unreconciled: (i) => `${i.channelName} 付款 #${i.ref} 已 ${i.days ?? '?'} 天还没对上真实${i.feeName}`,
  mismatch: (i) => `${i.channelName} 付款 #${i.ref} ${i.feeName}预估 ${dollars(i.estimateCents)}、实际 ${dollars(i.actualCents)}`,
  batch_mismatch: (i) => `${i.channelName} 批量扣费 ${dollars(i.actualCents)}（${i.feeName}）对不上当天的付款` +
    (i.estimateCents === null ? '' : `（按费率算 ${dollars(i.estimateCents)}）`),
  batch_unknown: (i) => `${i.channelName} 有一笔不认识的扣费 ${dollars(i.actualCents)}`,
}

const COUNTS: [FeeReconcileIssue['issue'], string][] = [
  ['unreconciled', '笔超时还没拿到真实手续费'],
  ['mismatch', '笔真实手续费和预估差得多'],
  ['batch_mismatch', '条 Stripe 批量扣费对不上付款'],
  ['batch_unknown', '条 Stripe 扣费类型不认识'],
]

function feeIssue(item: FeeReconcileIssue): string {
  const named = { ...item, channelName: CHANNEL_NAMES[item.channel] ?? item.channel, feeName: item.fee ? (FEE_NAMES[item.fee] ?? item.fee) : '手续费' }
  return LINES[item.issue](named)
}

// One message per run that found something: counts, the first five, then how many in all.
export function paymentFeeReconcile(alert: PaymentFeeReconcileAlert): { line: string; path: string } {
  const parts = COUNTS.map(([issue, words]) => [alert.issues.filter(i => i.issue === issue).length, words] as const)
    .filter(([count]) => count > 0).map(([count, words]) => `${count} ${words}`)
  const shown = alert.issues.slice(0, 5).map(feeIssue).join('；')
  const more = alert.issues.length > 5 ? ` 等 ${alert.issues.length} 项` : ''
  return {
    line: `【手续费对账】${parts.join('，')}。例如：${shown}${more}。付款不受影响；佣金先按预估费用，确认期满后再等最多 14 天。请到后台联盟页核对。`,
    path: '/admin/affiliates',
  }
}
