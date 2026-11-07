// Admin shell copy. The admin UI is Chinese only and is not localised (DESIGN §7, AGENTS §9).
export const SHELL_COPY = {
  brand: '管理后台',
  navLabel: '后台导航',
  backToSite: '回到网站',
  signedInAs: '当前账号',
  menu: '切换页面',
  nav: {
    overview: '概览',
    analytics: '流量与转化',
    users: '用户',
    tickets: '工单',
    orders: '订单与收入',
    jobs: '出图记录',
    costs: '成本对账',
    templates: '模板',
    providers: 'AI 供应商',
    requests: '需求审核',
    announcements: '公告横幅',
    features: '功能权限',
  },
} as const

export type AdminNavKey = keyof typeof SHELL_COPY.nav
