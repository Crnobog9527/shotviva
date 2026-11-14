// 「漏斗」 and 「模板」 tabs of /admin/analytics (ARCHITECTURE §16.2c). Admin is Chinese only
// (DESIGN §7). Every number has a plain one-line explanation behind its 「?」.

import type { FunnelSource } from '../insights/funnel'
import type { StepKey } from '../insights/steps'
import type { Grouping, Sort } from '../insights/templates'

type Metric = { label: string; help: string }

export const INSIGHTS_COPY = {
  filters: {
    label: '筛选',
    from: '从',
    to: '到',
    bucket: '按',
    buckets: { day: '天', week: '周' },
    locale: '语言',
    locales: { all: '全部', en: '英文', zh: '中文' },
    source: '来源',
    redraw: '重画率预警（%）',
    apply: '查看',
    rangeNote: (days: number) => `共 ${days} 天，北京时间，最多 92 天。`,
  },
  scope: (admins: number) => `只算真实用户：已去掉管理员账号（${admins} 个）。每 5 分钟更新一次。`,
  sources: {
    all: '全部',
    share: '分享链接',
    graylum: 'Graylum',
    affiliate: '推广员',
    ads: '广告',
    organic: '自然流量',
    unknown: '认不出来',
  } satisfies Record<FunnelSource | 'all', string>,
  sourceHelp:
    '每人只算一个来源：先看是否从 Graylum 绑定过来、是否绑了推广员（以数据库为准）；再看注册时带没带分享链接、第一次打开的页面从哪来（PostHog）。广告要有点击 id 或付费 utm 才认得出。',
  funnel: {
    title: '注册转化漏斗',
    desc: '这段时间每天（或每周）新注册的人，到现在为止有没有出第一张图、有没有付款。访客是同一段时间打开过网站的真人。',
    steps: {
      visitors: { label: '访客', help: '打开过 shotviva.com 公开页面的真人，同一个人在一段时间里只算一次（每天、每周、整段各自去重）。不含管理员、爬虫和自动程序。来自 PostHog。' },
      signups: { label: '注册', help: '这段时间新建的账号（数据库）。' },
      imaged: { label: '第一次出图', help: '这批注册的人里，到现在为止至少成功拿到一张图的人数（数据库，免费积分出的也算）。' },
      paid: { label: '第一次付费', help: '这批注册的人里，到现在为止至少付成功一笔的人数（数据库）。付款不要求先出图，所以有时比出图的人还多，这时不显示比例。' },
    } satisfies Record<StepKey, Metric>,
    imaged24h: { label: '24 小时内出图', help: '注册后 24 小时内拿到第一张图的人数。' },
    conversion: '比上一步',
    drop: (from: string, to: string, rate: string, lost: string) => `流失最多的一步：「${from}」→「${to}」，只有 ${rate} 走到下一步，少了 ${lost} 人。`,
    noDrop: '这段时间没有可比较的流失。',
    noSignups: '这段时间没有新注册的人。',
    visitorsMissing: '访客数来自 PostHog，现在没有读到；这一列先空着。',
    visitorsNotFor: '这个来源的人不经过网站页面进来，没有访客数。',
    maturing: '仍在累积',
    maturingNote: '标「仍在累积」的天或周里有注册不到 7 天的人，他们还可能出图、付款，那里的数字偏低不代表流失。',
    posthogNote: '访客、首次访问的来源和语言来自 PostHog，是近似值：装了广告拦截、没同意统计的访问会少记，所以访客数可能偏少，个别人会落到「认不出来」。注册、出图、付费以数据库为准。',
    truncated: '注册人数太多，有些人的来源没查完，可能算进了「认不出来」。',
    tableTitle: '按时间',
    bucketCol: { day: '日期', week: '周（周一起）' },
    breakdownTitle: '按来源和语言',
    breakdownDesc: '整段时间合计。按来源时保留语言筛选，按语言时保留来源筛选。',
    unknownLocale: '老账号和 Google 登录的账号没记注册语言时，看第一次打开的页面是不是中文；还认不出来的不算进任何语言。',
    group: '分组',
  },
  templates: {
    title: '模板表现',
    desc: '这段时间里出完的图（成功或失败，不含进行中），按模板、系列或分类汇总。点表头排序。',
    groupings: { template: '模板', series: '系列', category: '分类' } satisfies Record<Grouping, string>,
    noSeries: '不在系列里',
    columns: {
      uses: { label: '使用', help: '出完的任务数，成功加失败。' },
      users: { label: '用户', help: '用过的人数。按系列或分类汇总时是各模板人数相加（一个人用了两个模板算两次）。' },
      success: { label: '成功率', help: '成功 ÷（成功 + 失败）。低于 90% 标红。' },
      errors: { label: '失败原因', help: '失败最多的 3 个错误码和次数。' },
      redraw: { label: '重画率', help: '重画次数 ÷ 成功数，可能超过 100%。重画：用户从自己的作品点「再来一张」出的图（同一模板），以及海报的「重画这一张」。开始日期之前的时间段不显示重画率。' },
      cost: { label: '单张成本', help: '真实成本合计 ÷ 成功张数（失败的成本也摊进去）。只算有成本记录的任务。' },
      credits: { label: '单张积分', help: '成功图平均扣的积分。' },
      margin: { label: '毛利', help: '付费积分出的图：1 −（真实成本 ÷ 积分价值）。积分价值按所有套餐里最便宜的每积分单价算，是最保守的口径。免费积分出的图没有收入，只看下一列成本。' },
      freeCost: { label: '免费池成本', help: '免费积分出的图花的真实成本合计。' },
      favourites: { label: '收藏', help: '现在的收藏总数；括号里是这段时间新增的。' },
      shares: { label: '分享', help: '这段时间分享出去的次数；括号里是分享链接被打开的次数（PostHog）。' },
    } satisfies Record<Sort | 'errors' | 'credits' | 'freeCost', Metric>,
    flags: {
      idle: '14 天没人用',
      redraw: (rate: string) => `重画率高于 ${rate}`,
      failing: '成功率低于 90%',
      offline: '已下架',
    },
    flagSummary: (idle: number, redraw: number, failing: number) => `预警：${idle} 个在架模板 14 天没人用，${redraw} 个重画率偏高，${failing} 个成功率偏低。`,
    sharesMissing: '分享数来自 PostHog，现在没有读到。',
    redrawSince: (day: string | null) => (day ? `从 ${day} 起统计。` : '还没有记下过「再来一张」，暂不统计。'),
    redrawNotCounted: (day: string | null) =>
      day
        ? `重画从 ${day} 起统计（第一次记下「再来一张」的那天），这段时间开始得更早，重画率先不显示（显示「—」），也不算重画预警。`
        : '还没有记下过「再来一张」，重画率先不显示（显示「—」），也不算重画预警。',
    sharesNote: '分享次数来自 PostHog，装了广告拦截的浏览器会少记，是近似值；其余列以数据库为准。',
    empty: '没有模板。',
    members: (count: number) => `${count} 个模板`,
  },
}
