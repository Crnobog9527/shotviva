import type { ConnectionResult, ProviderAdapterId, ProviderSettingReason } from '../providers/types'

// /admin/providers copy. The admin UI is Chinese only and is not localised, so its words live
// here rather than in site/messages (DESIGN §7, AGENTS §9).
export const PROVIDERS_COPY = {
  title: '出图供应商',
  floorNotice: '积分下限表（ARCHITECTURE §6.1）是按 GPT-Image high 质量的成本定的。换成更贵的模型前，先请总控更新下限。',
  envFallback: '当前没有启用的供应商，出图使用环境变量 OPENAI_API_KEY / OPENAI_IMAGE_MODEL 兜底。',
  add: '新增供应商',
  empty: '还没有供应商。新增一条并测试连接成功后，再设为当前使用。',
  columns: {
    label: '显示名',
    adapter: '适配器',
    baseUrl: '地址',
    model: '模型',
    key: '密钥',
    status: '状态',
    updatedAt: '更新时间',
    actions: '操作',
  },
  adapters: { openai_images: 'OpenAI Images 接口' } satisfies Record<ProviderAdapterId, string>,
  active: '当前使用',
  inactive: '未使用',
  keyMasked: (last4: string) => `••••${last4}`,
  edit: '编辑',
  test: '测试连接',
  testing: '测试中…',
  activate: '设为当前使用',
  form: {
    titleNew: '新增供应商',
    titleEdit: (label: string) => `编辑「${label}」`,
    description: '保存后密钥只存密文，浏览器拿不到明文。',
    label: '显示名',
    labelHint: '如「OpenAI 官方」「某中转」',
    adapter: '适配器',
    adapterHint: 'OpenAI Images 接口形态（官方地址或兼容这套接口的中转）。接口不同的厂商要写新适配器，不是后台操作。',
    baseUrl: '接口根地址',
    baseUrlHint: '只允许 https://，例如 https://api.openai.com/v1',
    model: '模型名',
    modelHint: '例如 gpt-image-2.6',
    apiKey: '密钥',
    apiKeyNewHint: '必填。只写不读：保存后页面上只显示后 4 位。',
    apiKeyEditHint: (last4: string) => `留空表示不改（当前 ••••${last4}）。`,
    notes: '备注',
    cancel: '取消',
    save: '保存',
    saved: (label: string) => `已保存「${label}」`,
  },
  activateDialog: {
    title: '切换出图供应商？',
    body: (from: string, to: string, model: string) => `从「${from}」换到「${to}」（模型 ${model}）。确认后，下一次出图就用新的供应商。`,
    fromEnv: '环境变量兜底',
    cancel: '取消',
    confirm: '确认切换',
    done: (label: string) => `已切换到「${label}」`,
  },
  errors: {
    invalid_input: '填写的内容不合法，请检查各个字段',
    base_url_invalid: '地址格式不对（不能带账号、查询参数或 #）',
    base_url_not_https: '地址必须以 https:// 开头',
    base_url_private: '不能用本机、内网或保留地址',
    base_url_unresolvable: '这个域名解析不到',
    api_key_required: '新增供应商必须填写密钥',
    not_found: '这个供应商不存在，请刷新页面再试',
    secrets_key_missing: '服务器没有配置 PROVIDER_SECRETS_KEY，请联系 Owner',
    secrets_key_invalid: 'PROVIDER_SECRETS_KEY 格式不对（需要 32 字节 base64，例如 openssl rand -base64 32）',
    secret_unreadable: '存的密钥解不开（PROVIDER_SECRETS_KEY 换过），请编辑这条供应商重新填写密钥',
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
