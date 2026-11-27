// 推广名单 on /admin/orgs/[id]?tab=promo (2020). Admin pages are Chinese only (DESIGN §7).
import type { OrgCustomerBonus } from './types'

export const CUSTOMER_COPY = {
  title: '推广名单',
  hint: '归到本企业联盟账号的客户：一级是企业推广链接（?ref=）或员工个人邀请码带来的，二级是一级客户再邀请的；员工不算客户，只在「成员」里。按绑定时间倒序。付费为绑定后的税前实付（扣退款，美元）；佣金不含已作废的；推广奖励按企业整月合计发放，这里只显示此人计入的购买积分。',
  empty: '还没有归到本企业的用户。',
  noAccount: '企业还没有联盟账号，暂无推广名单（在「设置」标签打开企业联盟营销）。',
  colAccount: '账号',
  colLevel: '层级',
  colFrom: '来源',
  colSignedUp: '注册 / 绑定',
  colBonus: '注册福利',
  colPaid: '累计付费',
  colCommission: '佣金',
  colPromo: '计入推广奖励',
  level: (n: 1 | 2) => (n === 1 ? '一级' : '二级'),
  bindAt: '绑定',
  via: '经',
  pageInfo: (from: number, to: number, total: number) => `第 ${from}–${to} 位，共 ${total} 位`,
  pagesLabel: '推广名单翻页',
  first: '回到第一页',
  prev: '上一页',
  next: '下一页',
  // Overview numbers
  l1: '一级客户',
  l2: '二级客户',
  bonusUsers: '已领注册福利',
} as const

const SOURCES: Record<string, string> = {
  org_l1: '员工个人邀请码',
  org_l2: '一级客户邀请',
  signup: '企业推广链接注册',
  first_checkout: '经推广链接首次付款',
}
export const sourceLabel = (source: string | null) => (source ? SOURCES[source] ?? `其他（${source}）` : '—')

const ERRORS: Record<string, string> = {
  blocked_no_signup_grant: '未发：没领到注册赠送（同网络或同手机号限制）',
  blocked_org_member: '未发：已是本企业员工',
}
const NONE: Record<Extract<OrgCustomerBonus, { kind: 'none' }>['reason'], string> = {
  level2: '未发：二级客户不送',
  paid_before: '未发：绑定前已付过款，不算新用户',
  first_checkout: '未发：首次付款时才绑定，不算新注册',
  other: '未发：不是经企业推广链接或员工邀请码来的',
  before_org: '未发：企业成立前的个人推广客户',
  off_at_bind: '未发：绑定时企业没开注册福利',
  affiliate_off_at_bind: '未发：绑定时企业联盟开关关着',
  no_signup_gift: '未发：没领到注册赠送（没完成验证或从没登录过）',
  unrecorded: '未发：没有发放记录也没有出错记录，需要排查',
  banned: '未发：经企业推广链接注册，但账号已封禁，不补发',
  paid_since: '未发：经企业推广链接注册，#958 前漏发；已付过款，按补发规则不补',
  off_now: '未发：经企业推广链接注册，#958 前漏发；企业现在关了福利，暂不能补发',
  backfill: '未发：经企业推广链接注册，#958 前漏发，可补发',
}

export function bonusLabel(bonus: OrgCustomerBonus): string {
  if (bonus.kind === 'granted') return `已发 ${bonus.credits} 积分`
  if (bonus.kind === 'error') return ERRORS[bonus.error] ?? `发放出错：${bonus.error}`
  return NONE[bonus.reason]
}
