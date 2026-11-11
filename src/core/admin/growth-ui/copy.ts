// /admin/analytics 「总览」 copy (ARCHITECTURE §16.2b). Admin is Chinese only (DESIGN §7).
// Every number has a one-line plain explanation behind its 「?」.

import type { Range } from '../analytics/range'
import type { NewUserStep } from '../growth/funnel'

type Metric = { label: string; help: string }

// PostHog's numbers (visitors, uploads, paywall, checkout) are tagged 「核对中」 until their query
// has been checked against PostHog itself (control review of #483). Flip to true in that PR.
export const POSTHOG_VERIFIED = false

export const GROWTH_COPY = {
  views: { overview: '总览', details: '明细（旧版）' },
  viewLabel: '页面',
  detailsNote:
    '这里是旧版明细，留给需要细看时用。访客没有去掉管理员；「付款环节」「新用户激活」「模板表现」「体验问题」四块还混有测试站的数据。数字以「总览」为准。',
  period: { today: '今天', '7d': '近 7 天', '30d': '近 30 天' } satisfies Record<Range, string>,
  previous: { today: '昨天同一时刻', '7d': '上一个 7 天', '30d': '上一个 30 天' } satisfies Record<Range, string>,
  scope: (admins: number) =>
    `只算真实用户：已去掉管理员账号（${admins} 个）、测试站和爬虫。管理员没登录时的访问认不出来，可能还算在访客里。`,
  freshness: '所有数字每 5 分钟更新一次，数据库和 PostHog 截到同一时刻。',
  unverified: '核对中',
  unverifiedNote: '标「核对中」的数来自 PostHog（访客、上传照片、看到付费墙、开始结账），统计方法还没和 PostHog 后台逐一核对，先看大概。',
  headline: {
    chain: (p: { period: string; visitors: string | null; signups: string; images: string; paid: string }) =>
      `${p.period}：${p.visitors === null ? '' : `${p.visitors} 位访客 → `}${p.signups} 人注册 → ${p.images} 人出了第一张图 → ${p.paid} 人付款`,
    money: (payers: string, net: string) => `本期一共 ${payers} 人付款（含老用户），到手 ${net}。`,
    compare: (previous: string) => `和${previous}比`,
  },
  insight: {
    drop: (from: string, to: string, lost: string) => `新用户卡得最多的一步：「${from}」到「${to}」，少了 ${lost} 人。`,
    noSignups: '这段时间还没有新用户注册。',
    noDrop: '这段时间注册的新用户每一步都没有流失。',
  },
  trend: {
    visitors: '访客',
    signups: '注册',
    payers: '付款人数',
    net: '到手收入',
    up: '多了',
    down: '少了',
    same: '持平',
    previous: (value: string) => `上期 ${value}`,
  },
  funnel: {
    title: '用户转化漏斗',
    desc: '这段时间新注册的人，到这段时间结束为止各走到了哪一步。步骤不要求按顺序，一个人只算一次。',
    visitors: { label: '访客', help: '这段时间打开过 shotviva.com 页面的真人，同一个人只算一次。不含管理员和爬虫。' },
    visitorRate: (rate: string) => `访客里 ${rate} 注册了`,
    visitorRateHidden: '访客数比注册数还少（PostHog 少记了），比例先不显示',
    visitorRateHelp: '注册人数 ÷ 访客数。注册的人不一定是这段时间第一次来，所以这是一个比例，不是同一批人。',
    steps: {
      signup: { label: '注册', help: '这段时间新注册的账号数（以数据库为准）。' },
      upload: { label: '上传照片', help: '新用户里，成功上传过至少一张照片的人数。' },
      image: { label: '出第一张图', help: '新用户里，至少成功拿到一张生成图的人数（以数据库为准，免费积分出的也算）。' },
      paywall: { label: '看到付费墙', help: '新用户里，打开过选套餐 / 积分包页面的人数。' },
      checkout: { label: '开始结账', help: '新用户里，点了去付款、跳到 Stripe 或 Waffo 付款页的人数。' },
      paid: { label: '付款成功', help: '新用户里，至少付成功一笔的人数（以数据库为准）。' },
    } satisfies Record<NewUserStep, Metric>,
    ofSignups: '占注册',
    lost: (n: string) => `少了 ${n} 人`,
    missing: '这一步的数来自 PostHog，现在没有读到',
    loading: '正在从 PostHog 读取…',
    notConnected: 'PostHog 还没连上',
    returningTitle: '老用户',
    returningDesc: '这段时间之前注册的人。',
    returning: {
      active: { label: '回来出图', help: '之前注册、这段时间又成功出过图的人数。' },
      paid: { label: '付款', help: '之前注册、这段时间付过款的人数（含续费）。' },
    } satisfies Record<string, Metric>,
    bots: (n: string) => `另有 ${n} 次爬虫或机器访问，没有算进访客。`,
  },
  revenue: {
    title: '收入',
    desc: '以数据库里的付款记录为准，已扣掉税和退款。只加美元订单，不含管理员账号，所以可能比「订单与收入」页少。',
    metrics: {
      net: { label: '到手收入', help: '实收金额去掉税和退款（退款时税按比例一起退，全额退款的订单算 0）。拒付输掉的钱不会从这里扣，本页也不显示拒付结果，要看结果去「拒付」页。' },
      orders: { label: '订单', help: '这段时间付款成功的笔数，含续费。' },
      average: { label: '平均每单', help: '到手收入 ÷ 美元订单数。' },
      payers: { label: '付款人数', help: '这段时间付过款的人数，一个人付几笔只算一次。' },
    } satisfies Record<string, Metric>,
    kindTitle: '新单还是老单',
    kinds: {
      first: { label: '首购', help: '这个用户的第一笔付款。' },
      repeat: { label: '复购', help: '付过款的人又买了一次（不含自动续费）。' },
      renewal: { label: '自动续费', help: '订阅到期自动扣款。' },
    } satisfies Record<string, Metric>,
    typeTitle: '买的是什么',
    types: { plan: '套餐（订阅）', pack: '积分包' },
    channelTitle: '从哪里付的',
    channels: { stripe: 'Stripe', waffo: 'Waffo' },
    count: '笔数',
    amount: '到手',
    refunds: (n: string, amount: string) => `这段时间的订单里，后来退款的有 ${n} 笔，共 ${amount}（已从到手收入里扣掉）`,
    disputes: (n: string, amount: string) => `这段时间新开拒付 ${n} 笔，共 ${amount}`,
    noIssues: '这段时间没有退款和拒付。',
    nonUsd: (n: string) => `另有 ${n} 笔非美元订单，计入笔数，没有加进金额，请到订单页看。`,
    ordersLink: '去订单页看每一笔',
  },
  unavailable: '暂时读不到',
  unavailableBody: '这一块的数据没有读出来，其他块不受影响。稍后刷新再看。',
  unconfigured: 'PostHog 还没连上，访客、上传、付费墙和结账暂时没有数。',
} as const
