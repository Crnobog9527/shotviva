import type { CostsFailure } from './openai-costs'
import type { CostProvider } from './provider-days'

// /admin/costs copy (DESIGN §7: Chinese only, kept out of site/messages).

const PROVIDER_NAMES: Record<CostProvider, string> = { openai: 'OpenAI', openrouter: 'OpenRouter', ark: '火山方舟' }

export const COSTS_COPY = {
  title: '成本对账',
  intro: (days: number) =>
    `近 ${days} 天，每个出图供应商每天实际扣费和我们逐单记下的成本对比。按 UTC 自然日（北京时间早上 8 点换日），和供应商账单一致。打开页面时向供应商读取，缓存 1 小时；只读，不改任何数据。`,
  name: (provider: CostProvider) => PROVIDER_NAMES[provider],
  nav: '跳到：',
  // ARCHITECTURE §10.a 「成本对账说明」(T78): the two sides count different things.
  scopeNote: {
    openai: [
      '两边算的范围不一样：',
      '「实际扣费」是这个 OpenAI 项目下的全部用量，测试站、本地开发只要用的是同一个项目的密钥，也会算进去。',
      '「我们记录的成本」只算本站数据库里走 OpenAI 的出图，正式站后台就只算正式站用户的出图和正式站后台的模板试跑（单独列在「其中后台试跑」）。',
      '所以测试多的日子差额会偏大，不一定是算错了。',
    ],
    openrouter: [
      '两边算的范围不一样：',
      '「实际扣费」是整个 OpenRouter 账户的全部用量（所有密钥、所有模型，含测试站和本地开发）。',
      'OpenRouter 只给已结束的 UTC 日，今天的实际扣费要明天才有。',
      '「我们记录的成本」是本站走 OpenRouter 的出图，用的是 OpenRouter 回执里的实际费用。',
    ],
    ark: [
      '火山方舟按人民币计费：',
      '「我们记录的成本」是按官方刊例价逐单算的人民币，再按出图当时的汇率（CNY_PER_USD）折成美元。',
      '火山账单接口还没有接，所以这里没有「实际扣费」，请到火山引擎费用中心核对。',
    ],
  } satisfies Record<CostProvider, string[]>,
  cards: {
    ours: '我们记录的成本',
    billed: (provider: CostProvider) => `${PROVIDER_NAMES[provider]} 实际扣费`,
    difference: (provider: CostProvider) => `差额（${PROVIDER_NAMES[provider]} − 我们）`,
    jobs: (jobs: number) => `${jobs} 单用户出图`,
    oursHint: (uncosted: number, noUsage: number) => {
      const parts = []
      if (uncosted > 0) parts.push(`${uncosted} 单缺少单价或费用回执，成本待核`)
      if (noUsage > 0) parts.push(`${noUsage} 单没有用量（T33 之前的老任务或超时）`)
      return parts.length ? `不含：${parts.join('；')}` : '用户出图均有成本记录'
    },
    scope: (provider: CostProvider, projectId: string | null) => {
      if (provider === 'openrouter') return '整个账户的全部用量，不含今天'
      if (provider === 'ark') return '火山账单未接入'
      return projectId ? `项目 ${projectId} 下的全部用量，含测试站和本地开发` : '整个 OpenAI 组织的全部用量（没填项目 ID），含测试站和本地开发'
    },
    oursScope: '只算本站数据库里的出图',
    tests: (usd: string) => `含后台试跑 ${usd}`,
    cny: (cny: string) => `合人民币 ${cny}`,
  },
  testModel: (runs: number) => `（${runs} 次）`,
  columns: {
    day: '日期（UTC）', billed: '对方实际', ours: '我们记录', cny: '我们记录（人民币）', tests: '其中后台试跑',
    difference: '差额', costed: '有成本的单', missing: '算不出 / 无用量',
  },
  noKey: {
    openai: '还没有填 OpenAI 管理员密钥，下面只显示我们自己记录的成本。在下方填入密钥后即可对账。',
    openrouter: '还没有配置 OpenRouter 管理密钥（环境变量 OPENROUTER_MANAGEMENT_KEY），下面只显示我们自己记录的成本。',
    ark: '',
  } satisfies Record<CostProvider, string>,
  notConnected: '火山账单未接入：下面只显示我们自己记录的成本（人民币和折算的美元）。',
  failed: (provider: CostProvider, failure: CostsFailure, status: number | null, code: string | null) => {
    const name = PROVIDER_NAMES[provider]
    const reasons: Record<CostsFailure, string> = {
      unauthorized: provider === 'openai'
        ? '密钥被拒绝，请确认填的是组织的管理员密钥（Admin key），不是普通 API 密钥'
        : '密钥被拒绝，请确认配置的是管理密钥（Management key），不是出图用的普通密钥',
      rate_limited: `${name} 返回 HTTP 429（限流或额度用完）`,
      http_error: `${name} 返回错误（HTTP ${status ?? '-'}）`,
      network: `连不上 ${name}`,
      timeout: `读取 ${name} 超时`,
      bad_response: `${name} 返回的内容看不懂`,
    }
    const detail = code ? `，错误码 ${code}` : ''
    return `这次没读到 ${name} 账单：${reasons[failure]}${detail}。下面只显示我们自己记录的成本，1 分钟后刷新可重试。`
  },
  dash: '—',
  drift: (provider: CostProvider, days: number, from: string, to: string, percent: number) =>
    `${from} 到 ${to} 连续 ${days} 天，我们记录的成本和 ${PROVIDER_NAMES[provider]} 实际扣费相差超过 ${percent}%。价目表里的官方价可能过期了（或后台供应商单价填错、有算不出成本的单），请对照 ${PROVIDER_NAMES[provider]} 价格页核对。`,
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
