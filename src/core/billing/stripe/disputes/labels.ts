// Chinese labels for disputes (T82), shared by the Owner alerts and the admin 「拒付」 page
// (admin copy is Chinese only, DESIGN §7). Pure: no server-only, the page renders them too.

export const REASON_ZH: Record<string, string> = {
  fraudulent: '盗刷 / 非本人交易',
  unrecognized: '持卡人不认识这笔交易',
  product_not_received: '声称没收到服务',
  product_unacceptable: '声称服务不符',
  subscription_canceled: '声称已取消订阅',
  credit_not_processed: '声称退款没到账',
  duplicate: '重复扣款',
  general: '其他',
  customer_initiated: '持卡人发起',
  debit_not_authorized: '未授权扣款',
  noncompliant: '不合规',
  bank_cannot_process: '银行无法处理',
  incorrect_account_details: '账户信息有误',
  insufficient_funds: '余额不足',
  check_returned: '支票退回',
}

export const STATUS_ZH: Record<string, string> = {
  warning_needs_response: '询问中 · 待回应',
  warning_under_review: '询问中 · 审核中',
  warning_closed: '询问已结束',
  needs_response: '待提交证据',
  under_review: '已提交 · 银行审核中',
  appeal_needs_response: '申诉待回应',
  appeal_under_review: '申诉审核中',
  won: '胜诉',
  lost: '败诉',
  prevented: '已阻止',
}

// The states in which Stripe still takes evidence.
export const RESPONDABLE = ['needs_response', 'warning_needs_response'] as const

export function isRespondable(status: string): boolean {
  return (RESPONDABLE as readonly string[]).includes(status)
}

export function formatAmount(minor: number, currency: string): string {
  const format = new Intl.NumberFormat('zh-CN', { style: 'currency', currency: currency.toUpperCase() })
  return format.format(minor / 10 ** (format.resolvedOptions().maximumFractionDigits ?? 2))
}

const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000

// Beijing time, the Owner's clock, fixed format so server and browser agree.
export function formatDeadline(at: Date | null): string {
  if (!at) return '银行不接受回应'
  return `${new Date(at.getTime() + BEIJING_OFFSET_MS).toISOString().slice(0, 16).replace('T', ' ')}（北京时间）`
}
