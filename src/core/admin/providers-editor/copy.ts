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
      notice: '模板积分校验按所选模型的成本和已批准售价执行。',
      none: '当前没有启用的出图供应商，出图使用环境变量 OPENAI_API_KEY / OPENAI_IMAGE_MODEL 兜底。',
      modelHint: '例如 gpt-image-2.6',
    },
    decision: {
      title: '判断（作品编辑）',
      notice: '作品编辑先用它判断用户这句话要改的范围和要保留的元素，再加对应的约束段落。OpenAI 模型经 OpenRouter 调用（模型 openai/gpt-6-luna）。换脸判断、海报拍照/粘贴识别和逐字核对、提示词实验室倒推也用它。判断指令和约束段落在「出图设置 → 作品编辑规则」里改。',
      none: '当前没有启用的判断供应商：所有作品编辑都用「兜底」约束段落。',
      modelHint: '例如 gpt-6-luna',
    },
    dish_read: {
      title: '认菜（餐饮开关）',
      notice: '餐饮模板开「优化摆盘」或「优化器皿」时，先用它看用户的菜照片，写出菜名、主料和颜色、配料、器皿和菜形类别。用 OpenRouter 上看图更准的模型（如 openai/gpt-6-sol）；没有启用这一类时，认菜用上面的判断供应商。认菜指令在各餐饮模板的 food_flow.read 里改。',
      none: '当前没有启用的认菜供应商：认菜使用判断供应商。',
      modelHint: '例如 openai/gpt-6-sol',
    },
  } satisfies Record<ProviderModule, { title: string; notice: string; none: string; modelHint: string }>,
  add: '新增供应商',
  empty: '还没有供应商。新增一条并测试连接成功后，再设为当前使用。',
  columns: {
    label: '显示名',
    model: '模型与地址',
    key: '密钥',
    prices: '供应商单价（美元）',
    status: '状态',
    updatedAt: '更新时间（UTC）',
    actions: '操作',
  },
  adapters: { openai_images: 'OpenAI Images 接口', openrouter_images: 'OpenRouter Images 接口', ark_images: '火山方舟 Images 接口', openai_responses: 'OpenAI Responses 接口' } satisfies Record<ProviderAdapterId, string>,
  active: '当前使用',
  inactive: '未使用',
  keyMasked: (last4: string | null) => (last4 ? `••••${last4}` : '未设置'),
  prices: (text: string, image: string, output: string) => `文字输入 ${text} · 图片输入 ${image} · 输出 ${output}`,
  decisionPrices: (input: string, output: string) => `输入 ${input} · 输出 ${output}`,
  billingParts: { input_image: '图片输入', input_text: '文字输入', output_image: '图片输出' } as Record<string, string>,
  billingUnits: { image: '张', token: '百万 token', megapixel: '百万像素' } as Record<string, string>,
  noQuote: '目录未提供报价。',
  priceUnavailable: '报价同步暂不可用。',
  unknownInput: '目录未列输入价。',
  tokenUnit: '美元 / 百万 token',
  priceUnset: '未填',
  fallbackPricesMissing: '缺少估算单价；供应商未返回账单时无法估算成本。',
  pricesMissing: 'OpenRouter 目录里查不到这个模型的单价，也没有手填，这个供应商的任务算不出成本',
  arkPriceLine: (bands: string, input: number) => `每张输出 ${bands} · 每张输入图 ¥${input}（人民币，按 CNY_PER_USD 折美元）`,
  arkPriceAsOf: (asOf: string, source: string) => `手填官方价 · 核对于 ${asOf} · ${source}`,
  arkPriceMissing: '还没填火山方舟官方价，它的任务算不出成本。请在「编辑」里照火山方舟价格页填写。',
  arkBandAll: '每张',
  arkBandUpTo: (mp: number) => `≤${mp}M 像素`,
  arkBandAbove: (mp: number) => `>${mp}M 像素`,
  pricesFromCatalog: (date: string) => `OpenRouter 目录价 · 取于 ${date}`,
  edit: '编辑',
  test: '测试连接',
  testing: '测试中…',
  activate: '设为当前使用',
  delete: '删除',
  deleteActiveHint: '在用的不能删：先把另一条设为当前使用',
  refresh: '刷新能力',
  refreshed: '模型能力已刷新',
  fetched: '上次成功刷新',
  neverFetched: '尚未刷新',
  form: {
    imageCosts: '预估单张总成本（美元）',
    // Ark has no catalogue estimate to fall back on, so blank is not offered there (schema refine).
    imageCostsHint: (adapter: ProviderAdapterId) => adapter === 'ark_images'
      ? '有实测成本时优先用实测。火山方舟必须填写每档的预估单张总成本（含输入图），不能留空；实测样本不足时用它定积分下限。'
      : '有实测成本时优先用实测。留空使用可核算的目录估价（已含本站充值费用分摊）；也可填写含费估价覆盖。',
    extraInputCost: '每张额外输入图成本（美元）',
    extraInputCostHint: '格子模板（一单多张输入图、只出一张图）的成本下限用它：单图下限 + 多出的输入图 × 这个成本。留空时按单图下限 × 格子数保守计算。',
    byokListPrice: 'BYOK（按官方价）',
    byokListPriceHint: '用我们自己的 OpenAI 密钥经 OpenRouter 出图时打开：OpenAI 按官方价收费、OpenRouter 免手续费，积分下限按官方线路算（官方价估算、共用官方线路的实测成本和已批准价格），不加充值费用分摊。没配 BYOK、走 OpenRouter 余额时关掉。',
    catalogPrices: '供应商目录报价（美元）',
    titleNew: '新增供应商',
    titleEdit: (label: string) => `编辑「${label}」`,
    description: '密钥存进 Supabase Vault，浏览器拿不到明文。',
    label: '显示名',
    labelHint: '如「OpenAI 官方」「某中转」',
    adapter: '适配器',
    adapterHint: {
      openai_images: 'OpenAI Images 接口（官方地址或兼容服务）。',
      openrouter_images: '通过 OpenRouter 图片接口出图。测试连接只检查模型和密钥，免费。',
      ark_images: '火山方舟（大陆北京）Seedream 出图，按张计费。只有标准和高清两档。测试连接发一个不出图的请求，免费，并显示往返耗时。',
      openai_responses: 'OpenAI Responses API（结构化 JSON 输出，推理用最低档）。',
    } satisfies Record<ProviderAdapterId, string>,
    // The decision row's endpoint (decision-route.ts): one Responses adapter, two addresses.
    decisionRoutes: { openrouter: 'OpenRouter（Responses 接口）', openai: 'OpenAI 官方（Responses 接口）' },
    decisionRouteHint: {
      openrouter: 'OpenAI 模型一律经 OpenRouter，用 OpenRouter 的密钥（OpenAI 密钥在 OpenRouter 里配成 BYOK）。地址固定为 https://openrouter.ai/api/v1，模型名带 openai/ 前缀，如 openai/gpt-6-luna。测试连接检查 OpenRouter 密钥，免费。',
      openai: 'OpenAI 官方地址，模型名不带前缀，如 gpt-6-luna。只用于还没迁到 OpenRouter 的旧线路。',
    },
    decisionModelHint: '例如 openai/gpt-6-luna',
    resolutions: '支持的清晰度',
    tiersHint: '只能在模型支持的档位里取消勾选；取消后，绑定这个供应商的模板不再提供该档。',
    tiersUnknown: '代码里没有这个模型的规格，默认只开 1K。勾选 2K 或 4K 就是人工声明：保存时会写入审计记录，请先确认模型真的能出这个尺寸。',
    tiersDeclared: (tiers: string) => `人工声明：${tiers}（保存时写入审计）`,
    baseUrl: '接口根地址',
    baseUrlHint: '请填写供应商的 HTTPS API 根地址。',
    arkModelHint: '例如 doubao-seedream-5-5-261028（须先在火山方舟控制台开通）。',
    arkPricesTitle: '火山方舟官方价（人民币，手填）',
    arkPricesHint: '火山方舟没有可直接读取的公开价目接口，请照火山方舟「模型价格」页逐项填写，并填上该页网址和核对日期；价格变了要回来改。按环境变量 CNY_PER_USD 的汇率折成美元记成本。',
    arkOutputCny: '每张输出（元）',
    arkSplitMp: '分档像素（百万，可空）',
    arkOutputCnyAbove: '超过分档后每张（元）',
    arkInputCny: '每张输入图（元）',
    arkSource: '价格页网址',
    arkAsOf: '核对日期（YYYY-MM-DD）',
    arkPriceRequired: '必须填好输出价、输入图价、价格页网址和核对日期才能保存。只有一个价的模型把「分档像素」留空。',
    routerModelHint: '例如 google/gemini-3.1-flash-image。保存时自动读取该模型支持的清晰度、比例和参考图数量。',
    lookupPending: '正在查询模型能力与报价…',
    retryLookup: '重新查询',
    routerInput: '输入',
    routerOutput: '输出',
    model: '模型名',
    apiKey: '密钥',
    apiKeyNewHint: '必填，16～1024 个字符。只写不读：存进 Supabase Vault，页面上只显示后 4 位。',
    apiKeyEditHint: (last4: string | null) => (last4 ? `留空表示不改（当前 ••••${last4}）。` : '当前没有密钥，请填写。'),
    notes: '备注',
    routerOverride: '可选：自定义 token 估价（美元 / 百万 token）',
    pricesTitle: '单价（美元 / 百万 token）',
    routerPricesHint: '如需覆盖按 token 计价的估算，可在此填写。实际调用优先使用供应商回传的费用。',
    pricesHint: '用来把每单用量算成真实成本，只影响之后的任务；已完成的任务保留当时记下的成本。',
    priceCatalog: (date: string, source: string) => `OpenRouter 目录价 · 取于 ${date} · ${source}（每天自动更新，不用手填）`,
    priceCatalogMissing: 'OpenRouter 目录里没有这个模型的单价：请照供应商官方价格页手填；没填的项算不出成本。',
    priceNoCatalog: '这个地址没有可读取的价目目录：请照供应商官方价格页手填；没填的项算不出成本。',
    priceLookupFailed: '暂时读不到 OpenRouter 目录价，保存后每天会自动再取。',
    priceInputTextPerM: '文字输入',
    priceInputImagePerM: '图片输入',
    priceOutputPerM: '图片输出',
    priceTextOutputPerM: '文字输出',
    cancel: '取消',
    save: '保存',
    saved: (label: string) => `已保存「${label}」`,
  },
  activateDialog: {
    title: (module: ProviderModule) => ({ image: '切换出图供应商？', decision: '切换判断供应商？', dish_read: '切换认菜供应商？' })[module],
    body: (from: string, to: string, model: string) => `从「${from}」换到「${to}」（模型 ${model}）。确认后，下一次请求就用新的供应商。`,
    fromNone: { image: '环境变量兜底', decision: '未启用（全部用兜底）', dish_read: '未启用（用判断供应商）' } satisfies Record<ProviderModule, string>,
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
    not_found: '这个供应商配置已不可用，请刷新页面再试',
    provider_referenced: '模板正在使用这个供应商。请先在模板编辑页更换出图模型，再删除供应商。',
    provider_active: '这个供应商正在使用，不能删除。先把另一条设为当前使用再删',
    openrouter_model_missing: 'OpenRouter 上没有这个出图模型',
    openrouter_catalog_unavailable: '暂时无法查询 OpenRouter 出图模型，请稍后重试',
    internal: '操作失败，请稍后重试',
  } satisfies Record<ProviderSettingReason, string>,
} as const

// One line per connection test, shown next to the row that was tested.
export function connectionText(result: ConnectionResult): string {
  const took = result.ms === undefined ? '' : ` · 往返 ${result.ms} ms`
  return connectionStatus(result) + took
}

function connectionStatus(result: ConnectionResult): string {
  if (result.ok) return `连接成功（HTTP ${result.status}）`
  const status = result.status ?? '-'
  switch (result.failure) {
    case 'unauthorized':
      return `鉴权失败（HTTP ${status}），请检查密钥`
    case 'model_unavailable':
      return `模型不可用（HTTP ${status}）：请在火山方舟控制台开通该模型，并确认账户没有欠费`
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
