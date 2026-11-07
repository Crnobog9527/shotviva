import type { ProviderModule } from '@/core/providers/types'

import type { ConnectionResult, ProviderAdapterId, ProviderSettingReason } from '../providers/types'

// /admin/providers copy. The admin UI is Chinese only and is not localised, so its words live
// here rather than in site/messages (DESIGN §7, AGENTS §9).
export const PROVIDERS_COPY = {
  title: 'AI 供应商',
  // One section per module (ARCHITECTURE §3.3); 'decision' is the photo-edit range check (§5.2).
  modules: {
    image: {
      title: '出图',
      notice: '积分下限表（ARCHITECTURE §6.1）是按 GPT-Image high 质量的成本定的。换成更贵的模型前，先请总控更新下限。',
      none: '当前没有启用的出图供应商，出图使用环境变量 OPENAI_API_KEY / OPENAI_IMAGE_MODEL 兜底。',
      modelHint: '例如 gpt-image-2.6',
    },
    decision: {
      title: '判断（作品编辑）',
      notice: '作品编辑先用它判断用户这句话要改的范围和要保留的元素，再加对应的约束段落。第一版用 OpenAI 官方地址、模型 gpt-6-luna。判断指令和约束段落在「模板与提示词 → 作品编辑」里改。',
      none: '当前没有启用的判断供应商：所有作品编辑都用「兜底」约束段落。',
      modelHint: '例如 gpt-6-luna',
    },
  } satisfies Record<ProviderModule, { title: string; notice: string; none: string; modelHint: string }>,
  add: '新增供应商',
  empty: '还没有供应商。新增一条并测试连接成功后，再设为当前使用。',
  columns: {
    label: '显示名',
    model: '模型与地址',
    key: '密钥',
    prices: '单价（美元/百万 token）',
    status: '状态',
    updatedAt: '更新时间（UTC）',
    actions: '操作',
  },
  adapters: { openai_images: 'OpenAI Images 接口', openai_responses: 'OpenAI Responses 接口' } satisfies Record<ProviderAdapterId, string>,
  active: '当前使用',
  inactive: '未使用',
  keyMasked: (last4: string | null) => (last4 ? `••••${last4}` : '未设置'),
  prices: (text: string, image: string, output: string) => `文字输入 ${text} · 图片输入 ${image} · 输出 ${output}`,
  decisionPrices: (input: string, output: string) => `输入 ${input} · 输出 ${output}`,
  priceUnset: '未填',
  pricesMissing: '单价没填全，价目表里也没有这个模型，这个供应商的任务算不出成本',
  pricesFromTable: (asOf: string) => `空着的项按官方价 · 取于 ${asOf}`,
  edit: '编辑',
  test: '测试连接',
  testing: '测试中…',
  activate: '设为当前使用',
  delete: '删除',
  deleteActiveHint: '在用的不能删：先把另一条设为当前使用',
  form: {
    titleNew: '新增供应商',
    titleEdit: (label: string) => `编辑「${label}」`,
    description: '密钥存进 Supabase Vault，浏览器拿不到明文。',
    label: '显示名',
    labelHint: '如「OpenAI 官方」「某中转」',
    adapter: '适配器',
    adapterHint: {
      openai_images: 'OpenAI Images 接口形态（官方地址或兼容这套接口的中转）。接口不同的厂商要写新适配器，不是后台操作。',
      openai_responses: 'OpenAI Responses API（结构化 JSON 输出，推理用最低档）。地址请填 https://api.openai.com/v1。',
    } satisfies Record<ProviderAdapterId, string>,
    baseUrl: '接口根地址',
    baseUrlHint: '只允许 https://，例如 https://api.openai.com/v1',
    model: '模型名',
    apiKey: '密钥',
    apiKeyNewHint: '必填，16～1024 个字符。只写不读：存进 Supabase Vault，页面上只显示后 4 位。',
    apiKeyEditHint: (last4: string | null) => (last4 ? `留空表示不改（当前 ••••${last4}）。` : '当前没有密钥，请填写。'),
    notes: '备注',
    pricesTitle: '单价（美元 / 百万 token）',
    pricesHint: '用来把每单用量算成真实成本，改单价只影响之后的任务。价目表里有的模型会自动填官方价，可以改；留空的项按官方价算。',
    priceOfficial: (asOf: string) => `官方价 · 取于 ${asOf}`,
    priceEdited: (asOf: string) => `已改过官方价（官方价取于 ${asOf}）`,
    priceNoOfficial: '价目表里没有这个模型，请照供应商价目页填写；没填的项算不出成本。',
    priceInputTextPerM: '文字输入',
    priceInputImagePerM: '图片输入',
    priceOutputPerM: '图片输出',
    priceTextOutputPerM: '文字输出',
    cancel: '取消',
    save: '保存',
    saved: (label: string) => `已保存「${label}」`,
  },
  activateDialog: {
    title: (module: ProviderModule) => (module === 'image' ? '切换出图供应商？' : '切换判断供应商？'),
    body: (from: string, to: string, model: string) => `从「${from}」换到「${to}」（模型 ${model}）。确认后，下一次请求就用新的供应商。`,
    fromNone: { image: '环境变量兜底', decision: '未启用（全部用兜底）' } satisfies Record<ProviderModule, string>,
    cancel: '取消',
    confirm: '确认切换',
    done: (label: string) => `已切换到「${label}」`,
  },
  deleteDialog: {
    title: '删除供应商？',
    body: (label: string, model: string) =>
      `删除「${label}」（模型 ${model}），它在 Vault 里的密钥也一起删掉，不能恢复。已有的出图记录和成本不受影响。`,
    cancel: '取消',
    confirm: '确认删除',
    done: (label: string) => `已删除「${label}」`,
  },
  errors: {
    invalid_input: '填写的内容不合法，请检查各个字段',
    base_url_invalid: '地址格式不对（不能带账号、查询参数或 #）',
    base_url_not_https: '地址必须以 https:// 开头',
    base_url_private: '不能用本机、内网或保留地址',
    base_url_unresolvable: '这个域名解析不到',
    api_key_required: '新增供应商必须填写密钥',
    api_key_invalid: '密钥格式不对：16～1024 个字符，不能有空格或换行',
    api_key_missing: '这条供应商没有可用的密钥，请编辑后重新填写',
    not_found: '这个供应商不存在，请刷新页面再试',
    provider_active: '这个供应商正在使用，不能删除。先把另一条设为当前使用再删',
    internal: '操作失败，请稍后重试',
  } satisfies Record<ProviderSettingReason, string>,
} as const

// One line per connection test, shown next to the row that was tested.
export function connectionText(result: ConnectionResult): string {
  if (result.ok) return `连接成功（HTTP ${result.status}）`
  const status = result.status ?? '-'
  switch (result.failure) {
    case 'unauthorized':
      return `鉴权失败（HTTP ${status}），请检查密钥`
    case 'http_error':
      return `接口返回 HTTP ${status}，请检查地址`
    case 'redirect':
      return `接口返回重定向（HTTP ${status}），请填写最终地址`
    case 'timeout':
      return '连接超时'
    case 'network':
      return '连不上这个地址'
  }
}
