import { INQUIRIES_COPY } from '../admin/inquiries-ui/copy'
import { visitorText } from './visitor-text'
import type {
  BusinessInquiryAlert,
  CancelFailedAlert,
  Clawback,
  DisputeClosedAlert,
  DisputeDueSoonAlert,
  DisputeEvidenceFacts,
  DisputeOpenedAlert,
  GenerationSpikeAlert,
  Money,
  OwnerAlert,
  OwnerAlertKind,
  PaymentFailedAlert,
  RefundAlert,
  RenewalReviewAlert,
  SaleFloorExample,
  SaleFloorHiddenAlert,
  SiteErrorsAlert,
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

// path: an admin page on this site; href: somewhere else (the Sentry issue list).
type Rendered = { line: string; path: string; href?: string }

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

// The Owner reads alerts in China: deadlines are Beijing time.
const BEIJING_DAY = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

const deadline = (iso: string | null) => (iso ? `截止北京时间 ${BEIJING_DAY.format(new Date(iso))}` : '银行不接受回应')

// Same address as core/billing/stripe disputeAdminPath: the Stripe id is case-sensitive and the
// proxy lowercases page paths, so it goes in the query.
const disputePath = (disputeId: string) => `/admin/disputes/view?id=${encodeURIComponent(disputeId)}`

// T82: the evidence is drafted; say what is left for the Owner and by when.
const STAGED_TODO: Record<DisputeEvidenceFacts['responder'], string> = {
  shotviva: '申诉证据已整理成草稿，请到后台检查后提交',
  stripe: '这笔由 Stripe 应诉（Managed Payments），证据草稿已存给 Stripe 参考，不用你提交',
}

const DRAFT_TODO: Record<Exclude<DisputeEvidenceFacts['draft'], 'staged'>, string> = {
  failed: '证据草稿这次没能存到 Stripe（Stripe 重发通知时会自动重试），请到后台看看，必要时直接在 Stripe 后台提交',
  skipped: 'Stripe 上这笔已经不接受证据，请到后台看看',
}

function evidenceText(e: DisputeEvidenceFacts): string {
  const ban = e.autoBanned ? '账号已自动封禁。' : ''
  const todo = e.draft === 'staged' ? STAGED_TODO[e.responder] : DRAFT_TODO[e.draft]
  return `${ban}${todo}，${deadline(e.dueBy)}。`
}

function disputeOpened(alert: DisputeOpenedAlert, who: string): Rendered {
  const amount = alert.amount ? ` ${money(alert.amount)}` : ''
  const head = `【拒付】${who} 向银行投诉了 ${productName(alert.productId)}${amount} 这笔扣款，${creditsText(alert.credits)}。`
  if (!alert.evidence) return { line: `${head}请尽快到 Stripe 后台提交证据。`, path: userPath(alert.userId) }
  return { line: `${head}${evidenceText(alert.evidence)}`, path: disputePath(alert.disputeId) }
}

function disputeDueSoon(alert: DisputeDueSoonAlert, who: string): Rendered {
  const amount = alert.amount ? ` ${money(alert.amount)}` : ''
  return {
    line: `【拒付快到期】${who} 的 ${productName(alert.productId)}${amount} 拒付还没提交申诉，${deadline(alert.dueBy)}，只剩不到 3 天。`,
    path: disputePath(alert.disputeId),
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
  // Replies are sent at most once per ticket per 30 minutes, so say how many are waiting.
  const waiting = alert.pending && alert.pending > 1 ? `有 ${alert.pending} 条新消息还没回复` : '补充了新消息'
  const line = alert.reply
    ? `【工单回复${tag}】${who} 在「${type}」工单里${waiting}。`
    : `【新工单${tag}】${who} 提交了一张「${type}」工单，等你回复。`
  return { line, path: `/admin/tickets/${alert.ticketId}` }
}

function renewalReview(alert: RenewalReviewAlert): Rendered {
  const charged = alert.charged === null ? '未提供' : `${(alert.charged / 100).toFixed(2)} ${alert.currency?.toUpperCase() ?? '（币种缺失）'}`
  const line = `【Waffo 续费待核对】订单 ${alert.orderId} 第 ${alert.period} 期，税前报价 $${(alert.quoted / 100).toFixed(2)}，含税实收 ${charged}（税额 ${(alert.tax / 100).toFixed(2)}）。付款号 ${alert.paymentId}。${alert.duplicate ? '同一期出现不同付款号，请核对是否重复扣款。' : '请打开账单工单核对。'}`
  return { line, path: `/admin/tickets/${alert.ticketId}` }
}

function cancelFailed(alert: CancelFailedAlert, who: string): Rendered {
  const where = alert.channel ? CHANNELS[alert.channel] : '付款'
  const line = alert.cause === 'refund'
    ? `【订阅没取消】${who} 的 ${productName(alert.productId)} 已退款，但这笔的订阅没能自动取消，下个周期还会扣费，请到 ${where} 后台手动取消。`
    : alert.productId
    ? `【旧订阅没取消】${who} 升级后，原来的 ${productName(alert.productId)} 订阅没能自动取消，下个周期还会扣费，请到 ${where} 后台手动取消。`
    : `【旧订阅没取消】${who} 升级付款成功了，但系统没读到原来的订阅，请到后台确认有没有要手动取消的。`
  return { line, path: `/admin/users/${alert.userId}` }
}

const AREAS: Record<keyof SiteErrorsAlert['byArea'], string> = {
  payment: '付款',
  auth: '登录',
  generate: '出图',
  admin: '后台',
  site: '网站页面',
}

const TITLES: Record<SiteErrorsAlert['trigger'], string> = {
  payment: '付款出错',
  auth: '登录出错',
  generate: '网站报错偏多',
  admin: '网站报错偏多',
  site: '网站报错偏多',
  total: '网站报错偏多',
}

// The Owner reads alerts in China: times are Beijing time.
const BEIJING = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

function siteErrors(alert: SiteErrorsAlert): Rendered {
  const areas = (Object.entries(alert.byArea) as [keyof typeof AREAS, number][])
    .sort((a, b) => b[1] - a[1])
    .map(([area, count]) => `${AREAS[area]} ${count} 次`)
    .join('、')
  const since = BEIJING.format(new Date(alert.since))
  return {
    line: `【${TITLES[alert.trigger]}】过去 ${alert.windowMinutes} 分钟服务器出错 ${alert.total} 次（北京时间 ${since} 开始），出在：${areas}。用户可能受影响，详情在 Sentry。`,
    path: '',
    href: alert.sentryUrl,
  }
}

// T86: company, volume and uses only; the contact details are in the admin. The company name is
// the visitor's own words: made safe for a Feishu text message (visitor-text.ts) and cut short.
function businessInquiry(alert: BusinessInquiryAlert): Rendered {
  const name = visitorText(alert.company, 40)
  const uses = alert.uses.map((use) => INQUIRIES_COPY.uses[use]).join('、')
  return {
    line: `【新企业咨询】「${name}」想合作，每月预计出图 ${INQUIRIES_COPY.volumes[alert.volume]}，用途：${uses}。请到后台查看联系方式并跟进。`,
    path: `/admin/inquiries/${alert.inquiryId}`,
  }
}

const FLOOR_BASIS: Record<string, string> = { p95: '近 30 天实测 p95', estimate: '后台估价', catalog: '供应商目录价', list: 'OpenAI 保守价' }
const HIDDEN_REASONS: Record<string, string> = {
  sale_closed: '未开放销售', unpriced: '1K 未定价', no_route: '没有可用模型', route_unsupported: '模型不支持 1K',
}

function saleFloorExample(e: SaleFloorExample): string {
  if (e.reason !== 'below_floor') return `${e.templateId}（${HIDDEN_REASONS[e.reason] ?? e.reason}）`
  if (e.floor === null) return `${e.templateId}（模型无法定价）`
  const basis = FLOOR_BASIS[e.basis ?? ''] ?? '成本'
  const sample = e.basis === 'p95' && e.samples !== null ? ` ${e.samples} 张` : ''
  return `${e.templateId}（${e.quality}，售价 ${e.price ?? '?'} 积分，底价 ${e.floor} 积分，按${basis}${sample}）`
}

// 1295: never a silent catalogue gap. Counts first, then a few examples, then what to do.
function saleFloorHidden(alert: SaleFloorHiddenAlert): Rendered {
  const more = alert.total > alert.examples.length ? ` 等 ${alert.total} 个` : ''
  const floor = alert.belowFloor > 0 ? `，其中 ${alert.belowFloor} 个是 1K 售价低于成本下限` : ''
  return {
    line: `【模板不在创作页】已上架的 ${alert.total} 个模板现在没有显示${floor}。例如：${alert.examples.map(saleFloorExample).join('；')}${more}。用户看不到也买不了这些模板，请到后台模板页处理（改价，或走价格批准）。`,
    path: '/admin/templates',
  }
}

const RENDERERS: { [K in OwnerAlertKind]: (alert: Extract<OwnerAlert, { kind: K }>, who: string) => Rendered } = {
  refund,
  dispute_opened: disputeOpened,
  dispute_closed: disputeClosed,
  dispute_due_soon: disputeDueSoon,
  payment_failed: paymentFailed,
  waffo_renewal_review: renewalReview,
  generation_spike: generationSpike,
  catalog_publish_failed: a => ({ line: `【商品发布待核对】发布号 ${a.request}，步骤 ${a.step}。请到商品目录查看并重试。`, path: '/admin/products' }),
  checkout_catalog_failed: a => ({
    line: `【结账读目录失败】用户无法开始付款（错误码：${a.code}）。请检查商品目录迁移和数据库连接。`,
    path: '/admin/products',
  }),
  template_fallback: a => ({
    line: `【模板模型回退】模板 ${a.templateId}，原因 ${a.reason}，${a.rejected ? '已拒绝此次出图' : '已允许回退出图'}。`,
    path: '/admin/templates',
  }),
  ticket,
  subscription_cancel_failed: cancelFailed,
  site_errors: siteErrors,
  business_inquiry: businessInquiry,
  sale_floor_hidden: saleFloorHidden,
  work_reported: (a) => ({
    line: `【创作库作品被举报】原因：${REPORT_REASON_NAMES[a.reason] ?? a.reason}。作品仍在展示，请到「创作库审核」页决定是否下架。`,
    path: '/admin/gallery?tab=reported',
  }),
}

const REPORT_REASON_NAMES: Record<string, string> = {
  sexual: '色情', violence: '暴力', hate: '仇恨', minor: '未成年人', privacy: '隐私', ip: '侵权', spam: '垃圾内容', other: '其他',
}

export type RenderedAlert = { sentence: string; link: string }

// The sentence(s), then the link on its own line.
export function renderAlert(alert: OwnerAlert, ctx: RenderContext): RenderedAlert {
  const render = RENDERERS[alert.kind] as (a: OwnerAlert, who: string) => Rendered
  const { line, path, href } = render(alert, ctx.who ?? '一位用户')
  const link = href ? `去 Sentry 看：${href}` : `去后台看：${ctx.origin}${path}`
  return { sentence: `${ctx.testSite ? '（测试站）' : ''}${line}`, link }
}
