// PVUV.ai blocks on /admin/analytics while PostHog is off (ARCHITECTURE §5.1g): the overview's
// 「访客与来源」 and the 「漏斗」 view. Admin is Chinese only (DESIGN §7).

type Metric = { label: string; help: string }

export const PVUV_COPY = {
  href: 'https://pvuv.ai/sites',
  open: '在 PVUV.ai 里看',
  note: '数据来自 PVUV.ai，已去掉机器人和爬虫。PVUV 按它站点设置的时区算天，可能和上面按北京时间算的注册、付款差几个小时。',
  unconfigured: '还没接 PVUV 读取：在 Vercel 加服务端变量 PVUV_SITE 和 PVUV_READ_TOKEN（PVUV 里建的只读、单站点 token），这里才会出数。',
  failed: 'PVUV 暂时读不到，这一块稍后刷新再看；其他块不受影响。',
  pending: 'PVUV 还在整理这段时间的数据，数字可能不全，稍后刷新。',
  overview: {
    title: '访客与来源（PVUV.ai）',
    desc: '这段时间来了多少真人、看了多少页、从哪里来、看了哪些页面。',
    metrics: {
      visitors: { label: '访客', help: 'PVUV 认定的真人访客，同一个人只算一次；机器人和爬虫不算。管理员没登录时的访问也算在里面。' },
      views: { label: '浏览量', help: '真人打开页面的次数，重复打开累计计算。' },
      bounce: { label: '跳出率', help: '只看了一个页面就离开的访问占全部访问的比例。' },
      duration: { label: '平均停留', help: '每次访问从进站到最后一次操作的平均时长。' },
    } satisfies Record<string, Metric>,
    compare: (previous: string) => `和${previous}比`,
    sourcesTitle: '来源前 8',
    pagesTitle: '页面前 8',
    source: '来源',
    page: '页面',
    visitors: '访客',
    views: '浏览量',
    direct: '直接访问 / 没有来路',
  },
  funnels: {
    title: 'PVUV.ai 漏斗',
    desc: 'PostHog 关闭后，漏斗改在 PVUV.ai 里定义和统计。这里列出 PVUV 里保存的每一个漏斗，按上面选的时间范围算；要新建或修改漏斗，到 PVUV.ai 里改。',
    none: 'PVUV 里还没有保存的漏斗。到 PVUV.ai 里建一个，这里就会显示。',
    funnelId: (id: string) => `PVUV 漏斗编号 ${id}`,
    entered: (n: string) => `进入漏斗 ${n} 人`,
    cleanOnly: '只算 PVUV 判为真人的访客',
    lowSample: '样本太少',
    lowSampleHelp: '人数太少，转化率随便多一两个人就会变很多，先别下结论。',
    sideTitle: '旁支步骤',
    sideHelp: '漏斗主线以外单独统计的步骤，不算进主线的转化。',
    ofPrev: (rate: string) => `上一步的 ${rate}`,
    funnelFailed: '这个漏斗暂时读不到，稍后刷新再看。',
    empty: '这段时间还没有人进入这个漏斗。',
  },
} as const
