import type { Metric } from './parts'

// 「模板合集分享」 (ARCHITECTURE §5.1g). Admin pages are Chinese only (DESIGN §7).
export const COLLECTIONS_COPY = {
  title: '模板合集分享',
  desc: '用户在创作页多选模板、生成合集链接发给客户：生成了多少链接，客户打开、点注册、注册成功各多少人。链接数来自数据库；打开和注册来自 PVUV.ai，按 PVUV 站点的时区算天。',
  step: '环节',
  people: '人数',
  events: '次数',
  metrics: {
    links: { label: '生成链接', help: '这段时间新生成的合集链接条数（「次数」列）和生成的账号数（「人数」列）。' },
    revoked: { label: '其中已撤销', help: '这段时间生成的链接里，到现在已被生成者撤销的条数。' },
    opens: { label: '打开合集', help: '打开过合集页的人数和次数，登录和未登录都算。' },
    signupStarts: { label: '点了注册', help: '没登录、在合集页点某个模板的「用这个模板」后弹出注册框的人数和次数。' },
    signups: { label: '注册成功', help: '注册前 30 天内打开过合集链接的新用户人数（按注册时带的合集链接码算）。' },
  } satisfies Record<string, Metric>,
  topTitle: '打开最多的合集',
  topHelp: '按打开或点注册的人数排，前 10 个。',
  topCollection: '合集',
  topCode: '链接码',
  topVisitors: '人数',
  topSignups: '注册',
  untitled: '（没写标题）',
  pvuvUnconfigured: '还没接 PVUV 读取：在 Vercel 加服务端变量 PVUV_READ_TOKEN（PVUV 里建的只读、单站点 token），打开和注册的数字才会显示。',
  pvuvFailed: 'PVUV 暂时读不到，打开和注册的数字稍后再看；链接数不受影响。',
  pvuvPending: 'PVUV 还在整理这段时间的数据，数字可能不全，稍后刷新。',
  openPvuv: '在 PVUV.ai 里看',
  pvuvHref: 'https://pvuv.ai/sites',
}
