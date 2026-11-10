import type { CostsFailure } from './openai-costs'

// /admin/costs copy (DESIGN §7: Chinese only, kept out of site/messages).
export const COSTS_COPY = {
  title: '成本对账',
  intro: (days: number) =>
    `近 ${days} 天，每天 OpenAI 实际扣费和我们逐单记下的成本对比。按 UTC 自然日（北京时间早上 8 点换日），和 OpenAI 账单一致。打开页面时向 OpenAI 读取，缓存 1 小时；只读，不改任何数据。`,
  // ARCHITECTURE §10.a 「成本对账说明」(T78): the two sides count different things.
  scopeNote: [
    '两边算的范围不一样：',
    '「OpenAI 实际扣费」是这个 OpenAI 项目下的全部用量，测试站、本地开发只要用的是同一个项目的密钥，也会算进去。',
    '「我们记录的成本」只算本站数据库里记下了成本的出图，正式站后台就只算正式站用户的出图和正式站后台的模板试跑（单独列在「其中后台试跑」）。',
    '有 OpenRouter 成本的日期只显示各方金额，差额和连续偏差提示仅计算可比日期。',
    '所以测试多的日子差额会偏大，不一定是算错了。',
  ],
  cards: {
    ours: '我们记录的成本',
    billed: 'OpenAI 实际扣费',
    difference: '差额（OpenAI − 我们）',
    oursHint: (uncosted: number, noUsage: number) => {
      const parts = []
      if (uncosted > 0) parts.push(`${uncosted} 单缺少单价或费用回执，成本待核`)
      if (noUsage > 0) parts.push(`${noUsage} 单没有用量（T33 之前的老任务或超时）`)
      return parts.length ? `不含：${parts.join('；')}` : '用户出图均有成本记录'
    },
    scope: (projectId: string | null) =>
      projectId ? `项目 ${projectId} 下的全部用量，含测试站和本地开发` : '整个 OpenAI 组织的全部用量（没填项目 ID），含测试站和本地开发',
    oursScope: '只算本站数据库里的出图',
    tests: (usd: string) => `含后台试跑 ${usd}`,
  },
  testModel: (runs: number) => `（${runs} 次）`,
  columns: { day: '日期（UTC）', billed: 'OpenAI 实际', ours: '我们记录', tests: '其中后台试跑', difference: '差额', costed: '有成本的单', missing: '算不出 / 无用量' },
  noKey: '还没有填 OpenAI 管理员密钥，下面只显示我们自己记录的成本。在下方填入密钥后即可对账。',
  failed: (failure: CostsFailure, status: number | null) => {
    const reasons: Record<CostsFailure, string> = {
      unauthorized: '密钥被拒绝，请确认填的是组织的管理员密钥（Admin key），不是普通 API 密钥',
      http_error: `OpenAI 返回错误（HTTP ${status ?? '-'}）`,
      network: '连不上 OpenAI',
      timeout: '读取 OpenAI 超时',
      bad_response: 'OpenAI 返回的内容看不懂',
    }
    return `这次没读到 OpenAI 账单：${reasons[failure]}。下面只显示我们自己记录的成本，稍后刷新重试。`
  },
  dash: '—',
  drift: (days: number, from: string, to: string, percent: number) =>
    `${from} 到 ${to} 连续 ${days} 天，我们记录的成本和 OpenAI 实际扣费相差超过 ${percent}%。价目表里的官方价可能过期了（或后台供应商单价填错、有算不出成本的单），请对照 OpenAI 价格页核对。`,
  key: {
    title: 'OpenAI 管理员密钥',
    body: '在 OpenAI 组织设置的 Admin keys 里新建一把（和出图用的密钥分开），只用来读账单。存进 Supabase Vault，页面上只显示后 4 位。',
    current: (last4: string | null) => (last4 ? `当前 ••••${last4}` : '还没有填'),
    apiKey: '管理员密钥',
    apiKeyHint: (hasKey: boolean) => (hasKey ? '留空表示不改。' : '形如 sk-admin-…'),
    projectId: '项目 ID（可选）',
    projectIdHint: '填出图密钥所在的项目（proj_…），只对这个项目的费用；留空按整个组织算。',
    save: '保存',
    clear: '删除密钥',
    saved: '已保存',
    cleared: '已删除密钥',
  },
} as const
