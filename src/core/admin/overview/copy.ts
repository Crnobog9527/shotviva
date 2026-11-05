// /admin overview copy (DESIGN §7: Chinese only, kept out of site/messages).
export const OVERVIEW_COPY = {
  title: '概览',
  timezone: '按北京时间统计，每次打开页面实时计算。',
  windows: { today: '今日', '7d': '近 7 天', period: (days: number) => `近 ${days} 天` },
  cards: {
    signups: '注册数',
    jobs: '出图数',
    successRate: '出图成功率',
    successHint: (succeeded: number, failed: number) => `成功 ${succeeded} · 失败 ${failed}（进行中的不计）`,
    credits: '消耗积分',
    creditsHint: (free: number, paid: number) => `免费 ${free} · 付费 ${paid}`,
    newPaying: '新增付费用户',
    revenue: '收入',
    revenuePending: 'T9 上线后可用',
  },
  trend: {
    title: (days: number) => `近 ${days} 天出图`,
    legend: '柱高为当天出图数，深色部分为成功',
    revenue: '收入趋势在订单页上线（T9 之后）时加入。',
    day: (day: string, jobs: number, succeeded: number) => `${day}：出图 ${jobs}，成功 ${succeeded}`,
  },
  error: '统计读取失败，请稍后刷新。',
} as const
