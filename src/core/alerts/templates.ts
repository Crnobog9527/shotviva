import type {
  CancelFailedAlert,
  Clawback,
  DisputeClosedAlert,
  DisputeOpenedAlert,
  GenerationSpikeAlert,
  Money,
  OwnerAlert,
  OwnerAlertKind,
  PaymentFailedAlert,
  RefundAlert,
  TicketAlert,
} from './alert-kinds'

// The Owner's Chinese alert copy, all in one place (ARCHITECTURE §16.4, T72; Owner 2026-11-07:
// 「要中文、不要代码式的描述」). One or two plain sentences, then the admin link. No prompts, image
// addresses, full emails or phone numbers, keys or event codes ever go in.

export type RenderContext = {
  // Masked email or phone of the user involved, when there is one.
  who: string | null
  origin: string
  // Anything but production: the Owner must not mistake a test-site alert for a real one.
  testSite: boolean
}

type Rendered = { line: string; path: string }

const PRODUCT_NAMES: Record<string, string> = {
  starter_monthly: 'Starter 月付',
  starter_yearly: 'Starter 年付',
  pro_monthly: 'Pro 月付',
  pro_yearly: 'Pro 年付',
  max_monthly: 'Max 月付',
  max_yearly: 'Max 年付',
  pack_s: 'S 积分包',
  pack_m: 'M 积分包',
  pack_l: 'L 积分包',
}

// Same names as the user's help dialog (site/messages/zh.json app.support.types).
const TICKET_TYPES: Record<string, string> = {
  feedback: '意见反馈',
  image_issue: '出图问题',
  billing: '付款与账单',
  refund: '申请退款',
  account: '账号问题',
  other: '其他',
}

const CHANNELS = { stripe: 'Stripe', waffo: 'Waffo' } as const

const NOTICES: Record<PaymentFailedAlert['step'], string> = {
  purchase: '一笔付款',
  renewal: '一笔续费',
  subscription: '一条订阅状态更新',
  refund: '一条退款通知',
  dispute: '一条拒付通知',
  other: '一条付款通知',
}

export function productName(productId: string | null): string {
  return (productId && PRODUCT_NAMES[productId]) || '一笔付款'
}

export function money(amount: Money): string {
  const value = (amount.cents / 100).toFixed(2)
  return amount.currency === 'usd' ? `$${value}` : `${value} ${amount.currency.toUpperCase()}`
}

const userPath = (userId: string | null) => (userId ? `/admin/users/${userId}` : '/admin/orders')

function creditsText(credits: Clawback | null): string {
  if (!credits) return '积分处理见后台'
  if (credits.shortfall > 0) return `已扣回 ${credits.clawedBack} 积分，还差 ${credits.shortfall} 积分没扣回（已被用掉）`
  if (credits.clawedBack === 0) return '没有要扣回的积分'
  return `已自动扣回 ${credits.clawedBack} 积分`
}

// Waffo's refund names no amount: the payment's own total is given instead.
function refundAmount({ refunded, amount }: RefundAlert): string {
  if (!refunded) return amount ? `有一笔退款（这笔付了 ${money(amount)}）` : '有一笔退款'
  const partial = amount && refunded.cents < amount.cents ? `（这笔共付 ${money(amount)}，部分退款）` : ''
  return `退款 ${money(refunded)}${partial}`
}

function refund(alert: RefundAlert, who: string): Rendered {
  return {
    line: `【退款】${who} 的 ${productName(alert.productId)}${refundAmount(alert)}，${creditsText(alert.credits)}。`,
    path: userPath(alert.userId),
  }
}

function disputeOpened(alert: DisputeOpenedAlert, who: string): Rendered {
  const amount = alert.amount ? ` ${money(alert.amount)}` : ''
  return {
    line: `【拒付】${who} 向银行投诉了 ${productName(alert.productId)}${amount} 这笔扣款，${creditsText(alert.credits)}。请尽快到 Stripe 后台提交证据。`,
    path: userPath(alert.userId),
  }
}

function disputeClosed(alert: DisputeClosedAlert, who: string): Rendered {
  const subject = `${who} 的 ${productName(alert.productId)}${alert.amount ? ` ${money(alert.amount)}` : ''}`
  const returned = alert.creditsReturned ? `，已还回 ${alert.creditsReturned} 积分` : ''
  const line = alert.won
    ? `【拒付结果】${subject} 的拒付我们赢了，钱回到我们这边${returned}。`
    : `【拒付结果】${subject} 的拒付我们输了，钱退给了用户，扣回的积分不再还回。`
  return { line, path: userPath(alert.userId) }
}

function grantSubject(alert: PaymentFailedAlert): string {
  const amount = alert.amount ? ` ${money(alert.amount)} 的` : ''
  const renewal = alert.step === 'renewal' ? '续费' : ''
  const product = alert.productId ? ` ${productName(alert.productId)}${renewal}` : renewal || '付款'
  return `一笔${amount}${product}`
}

function paymentFailed(alert: PaymentFailedAlert): Rendered {
  const channel = CHANNELS[alert.channel]
  const line =
    alert.step === 'purchase' || alert.step === 'renewal'
      ? `【付款没到账】${grantSubject(alert)}没能自动到账（${channel}），请到后台订单页处理。`
      : `【付款通知出错】${channel} 发来的${NOTICES[alert.step]}没能处理，${channel} 会自动重发；如果一直失败，请到后台订单页看看。`
  return { line, path: '/admin/orders' }
}

function generationSpike(alert: GenerationSpikeAlert): Rendered {
  const rate = Math.round((alert.failed / alert.total) * 100)
  return {
    line: `【出图失败偏多】过去 ${alert.windowMinutes} 分钟有 ${alert.failed} 张图没生成出来（共 ${alert.total} 张，失败 ${rate}%），失败的积分会自动退回，可能是出图服务出了问题。`,
    path: '/admin/jobs?status=failed',
  }
}

function ticket(alert: TicketAlert, who: string): Rendered {
  const type = (alert.ticketType && TICKET_TYPES[alert.ticketType]) || '其他'
  const tag = alert.ticketType === 'refund' ? '·退款申请' : ''
  const line = alert.messageId
    ? `【工单回复${tag}】${who} 在「${type}」工单里补充了新消息。`
    : `【新工单${tag}】${who} 提交了一张「${type}」工单，等你回复。`
  return { line, path: `/admin/tickets/${alert.ticketId}` }
}

function cancelFailed(alert: CancelFailedAlert, who: string): Rendered {
  const where = alert.channel ? CHANNELS[alert.channel] : '付款'
  const line = alert.productId
    ? `【旧订阅没取消】${who} 升级后，原来的 ${productName(alert.productId)} 订阅没能自动取消，下个周期还会扣费，请到 ${where} 后台手动取消。`
    : `【旧订阅没取消】${who} 升级付款成功了，但系统没读到原来的订阅，请到后台确认有没有要手动取消的。`
  return { line, path: `/admin/users/${alert.userId}` }
}

const RENDERERS: { [K in OwnerAlertKind]: (alert: Extract<OwnerAlert, { kind: K }>, who: string) => Rendered } = {
  refund,
  dispute_opened: disputeOpened,
  dispute_closed: disputeClosed,
  payment_failed: paymentFailed,
  generation_spike: generationSpike,
  ticket,
  subscription_cancel_failed: cancelFailed,
}

export type RenderedAlert = { sentence: string; link: string }

// The sentence(s), then the link on its own line.
export function renderAlert(alert: OwnerAlert, ctx: RenderContext): RenderedAlert {
  const render = RENDERERS[alert.kind] as (a: OwnerAlert, who: string) => Rendered
  const { line, path } = render(alert, ctx.who ?? '一位用户')
  return { sentence: `${ctx.testSite ? '（测试站）' : ''}${line}`, link: `去后台看：${ctx.origin}${path}` }
}
