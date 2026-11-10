// Admin is Chinese-only (DESIGN §7); this editor block's text lives here, not in messages.
export const zhCopy = {
  legend: '中文（/zh 页面显示）',
  hint: '留空的项在中文页面显示英文。提示词不翻译，始终用英文。',
  name: '中文名称',
  description: '中文说明（一句话，选填）',
  fieldLabel: (key: string) => `字段「${key}」的中文标签`,
  fieldPlaceholder: (key: string) => `字段「${key}」的中文占位提示`,
  noFields: '这个模板没有文案字段。',
} as const

// The English text in 公开信息 (T52).
export const publicCopy = {
  name: '英文名称',
  description: '英文说明（一句话，选填）',
  descriptionHint: '英文页面显示这句；中文说明留空时，中文页面也显示它。不会自动翻译。',
} as const

// The category picker (DESIGN §7 admin is Chinese). Categories themselves are managed in
// 分类管理 on the same page (T75).
export const categoryCopy = {
  label: '分类',
  placeholder: '请选择分类',
  hint: '可以选择任意一级。新增或调整分类请到「分类管理」。',
  series: '所属系列',
  standalone: '单个模板',
  systemHint: '内置模板的系统分类，不能更改。',
} as const

// Bulk 上架 / 下架 (T60).
export const bulkCopy = {
  selectAll: '全选当前列表',
  selectRow: (name: string) => `选择 ${name}`,
  selected: (count: number) => `已选 ${count} 个`,
  publish: '上架所选',
  unpublish: '下架所选',
  clear: '取消选择',
  cancel: '取消',
  title: (active: boolean, count: number) => `${active ? '上架' : '下架'}这 ${count} 个模板？`,
  publishHint:
    '缺提示词、缺英文名称或说明、缺前后对比封面、积分低于下限的不会上架，结果里逐条列出原因；其余立即出现在首页和 Create。',
  unpublishHint: '下架后用户和伙伴入口都看不到这些模板，可以随时重新上架。',
  featuredNote: (names: string) => `${names} 在首页精选里，下架后会从首页精选移除。`,
  reasonLabel: '下架原因（必填，写进每个模板的操作记录）',
  confirm: (active: boolean) => (active ? '确认上架' : '确认下架'),
  resultTitle: (active: boolean) => (active ? '批量上架结果' : '批量下架结果'),
  changed: (active: boolean, count: number) => `${active ? '已上架' : '已下架'} ${count} 个`,
  unchanged: (active: boolean, count: number) => `${count} 个原本就已${active ? '上架' : '下架'}，没有改动`,
  skipped: (active: boolean, count: number) => `${count} 个没有${active ? '上架' : '下架'}，保持原状`,
  dismiss: '关闭',
} as const

// Drag-to-reorder and the arrows (T76).
export const orderCopy = {
  saved: '排序已保存',
  failed: '顺序没保存，已退回原来的顺序。',
  offline: '连不上服务器，请检查网络后重试。',
  filtered: '清空筛选和搜索、关闭系列分组后，可调整同一上架状态内的顺序',
  dragHint: '按住左边的把手上下拖动调整顺序；手机上长按整行再拖。',
} as const

// Batch edit (T79).
export const bulkEditCopy = {
  open: '批量编辑…',
  title: (count: number) => `批量编辑 ${count} 个模板`,
  hint: '只改填了或选了的项，留空 / 「不改」的保持每个模板原来的值。保存前逐个按积分下限检查，有一个不合格就整批不保存。',
  creditsLegend: '积分（每档单独填，留空不改）',
  surfaces: '展示入口',
  surfaceOptions: { '': '不改', web: '只在站内', partner: '只给伙伴', both: '站内 + 伙伴' },
  quality: '模板质量档',
  qualityOptions: { '': '不改', high: 'high', medium: 'medium' },
  category: '分类',
  categoryKeep: '不改',
  nothing: '至少改一项',
  next: '检查并确认',
  back: '返回修改',
  cancel: '取消',
  reviewTitle: (count: number) => `确认修改这 ${count} 个模板？`,
  changes: '要改的内容',
  templates: (count: number) => `涉及的模板（${count} 个）`,
  featuredNote: (names: string) => `${names} 在首页精选里，不再站内展示后会从首页精选移除。`,
  failuresTitle: (count: number) => `${count} 个模板不合格，整批不会保存：`,
  confirm: (count: number) => `确认修改 ${count} 个`,
  done: (count: number) => `已批量修改 ${count} 个模板`,
  skipped: (names: string) => `${names} 是系统模板（作品编辑 / 伙伴自由生成），不参与批量编辑，已跳过。`,
  noneEditable: '选中的都是系统模板，没有可批量编辑的模板。',
} as const

// Cover area with language tabs (ARCHITECTURE §8.3 「封面按语言适配」, T87).
export const coverCopy = {
  fallback: '此语言未上传专属图，当前显示回退封面。',
  download: (slot: 'before' | 'after') => slot === 'before' ? '下载前图' : '下载后图',
  legend: '封面（上传后立即生效，不随「保存」）',
  tabs: '封面语言',
  upcoming: '准备中',
  hasCover: '已有封面',
  before: '前图（手机原图）',
  after: '后图（AI 成品）',
  motion: '动态封面（可选）',
  stillHint: 'JPEG / PNG / WebP，≤20MB',
  motionHint: 'GIF / 动态 WebP ≤20MB，或 MP4 ≤15MB ≤15 秒',
  cardType: (type: string) => `当前卡片类型：${type}`,
  backToStill: '改回静态图卡片',
  commonNote: '通用封面：没有专属封面的语言都显示它。只传这一套，所有语言就都用它。',
  languageNote: (label: string) =>
    `「${label}」页面的专属封面，可以空着：空着的部分显示通用封面（没有通用封面时，按页签顺序取第一个有封面的语言）。前图一般各语言共用，只换后图即可。`,
  upcomingNote: (label: string) => `「${label}」页面还没上线：可以先准备封面，前台暂不显示，上线后自动生效。`,
  clearLanguage: (label: string) => `删除「${label}」的专属封面`,
  confirmClear: (label: string) => `删除「${label}」的专属封面？这个语言的页面会改回显示通用封面。`,
  translate: '生成其他语言版本',
  cancel: '取消',
  confirmDelete: '删除',
} as const

// 开关 (T89): optional on/off choices of a template, e.g. 优化摆盘 / 优化器皿.
export const toggleCopy = {
  legend: '开关（选填，最多 3 个）',
  hint: '用户在工作台看到的开关，默认关。提示词正文里放 {{key}}，下面「开」「关」两段是私有的，只存服务端。饮品等不需要的模板不要加。',
  add: '添加开关',
  addPreset: (label: string) => `添加「${label}」`,
  remove: '删除这个开关',
  key: 'key（小写字母、数字、下划线）',
  label: '英文名称',
  labelZh: '中文名称',
  hint_: '英文说明（选填）',
  hintZh: '中文说明（选填）',
  confirm: '开启前弹确认框（用户必须勾选才能开启）',
  confirmEn: '确认框（英文）',
  confirmZh: '确认框（中文，留空显示英文）',
  title: '标题',
  body: '正文',
  checkbox: '复选框文字',
  accept: '开启按钮文字',
  on: '「开」时放进 {{key}} 的文字（私有）',
  off: '「关」时放进 {{key}} 的文字（私有）',
} as const

// Starter toggles for food templates (TASKS T89; Owner 2026-11-10 split plating from tableware).
// Both start off for the user and need the confirm dialog; the on / off fragments are written in
// the admin by the template studio window and are never in the repository.
const responsibility = {
  en: 'If customers order from the photo and get something different, it can lead to complaints or bad reviews. Use it only if you can serve the dish the way it looks. You are responsible for how you use photos made with this option; Shotviva is not responsible for disputes caused by differences between the photo and the real dish.',
  zh: '顾客按图点单后发现实物不符，可能引起投诉或差评。建议只在你能按图出品时使用。开启后生成的图片如何使用由你自行负责，因图片与实物不符引起的纠纷与 Shotviva 无关。',
}
const preset = (key: string, en: { label: string; hint: string; does: string }, zh: { label: string; hint: string; does: string }) => ({
  key,
  label: en.label,
  hint: en.hint,
  labelZh: zh.label,
  hintZh: zh.hint,
  confirm: true,
  confirmEn: { title: 'Before you turn this on', body: `${en.does} ${responsibility.en}`, checkbox: 'I understand and take responsibility', accept: 'Turn on' },
  confirmZh: { title: '开启前请确认', body: `${zh.does}${responsibility.zh}`, checkbox: '我已了解并自行承担', accept: '开启' },
  on: '',
  off: '',
})

export const TOGGLE_PRESETS = [
  preset(
    'plating',
    { label: 'Improve plating', hint: 'Arranges your dish more neatly. The result may differ from what you serve.', does: 'With this on, the AI re-arranges the food on the plate so it looks neater, and the photo may look noticeably different from what you actually serve.' },
    { label: '优化摆盘', hint: 'AI 把菜重新摆得更整齐好看，成品可能和实物不同', does: '开启后，AI 会把菜重新摆得更整齐好看，生成的图可能和你实际出品的样子差别明显。' },
  ),
  preset(
    'tableware',
    { label: 'Upgrade tableware', hint: 'Swaps in finer plates and bowls. The result may differ from what you serve.', does: 'With this on, the AI swaps your plates and bowls for finer tableware, so the photo may look noticeably different from what you actually serve.' },
    { label: '优化器皿', hint: 'AI 换用更精致的盘碗器皿，成品可能和实物不同', does: '开启后，AI 会把盘碗换成更精致的器皿，生成的图可能和你实际出品的样子差别明显。' },
  ),
] as const

type CountRange = { min: number; max: number } | null
const refRange = (range: CountRange) => {
  if (!range) return '未知'
  return range.min === range.max ? String(range.min) : `${range.min}–${range.max}`
}

export const styleRefCopy = {
  title: '画风参考图（不对用户显示）',
  orderHint: '出图时按顺序附在用户照片之后。提示词里请写明：前面的图是要重画的照片，最后 N 张只参考画风。',
  rightsHint: '请用没有真人正脸、或已获授权的图做参考，避免模型把参考图里的人脸画进用户的图里。',
  reuse: '复用 AI 成品封面', noAfter: '当前没有可复用的后图（AI 成品）。',
  full: '画风参考图已满 3 张，可先移除一张。', alreadyAdded: '这张 AI 成品封面已在参考图列表中。',
  add: '上传参考图', replace: '替换', remove: '移除', uploading: '正在处理参考图…',
  label: (n: number) => `画风参考图 ${n}`,
  limit: (users: CountRange, refs: number, total: CountRange, model: CountRange) =>
    `用户照片 ${refRange(users)} 张 + 画风参考图 ${refs} 张，共 ${refRange(total)} 张。所选模型支持 ${refRange(model)} 张。`,
  under: '输入图片总数可能低于模型下限。请添加参考图、提高用户最少上传张数，或更换模型。',
  over: '输入图片总数超过模型上限。请减少参考图或用户上传张数，或更换模型。',
  missingCap: '尚无可靠的参考图张数范围，暂不能保存带参考图的配置。',
  needId: '先填写有效的模板 ID，再上传参考图。', idLocked: '移除已上传的参考图后可修改模板 ID。', invalidUpload: '上传失败，请重试。', decodeFailed: '无法读取图片，请换一个文件。',
} as const

export function fallbackPriceCopy(tiers?: Record<'1k' | '2k' | '3k', number | null>) {
  const floor = (tier: '1k' | '2k' | '3k') => tiers?.[tier] ?? '不可用'
  return `回退到默认模型时的最低积分：Standard ${floor('1k')}、HD ${floor('2k')}、Max ${floor('3k')}。当前售价低于对应下限或该档不可用时，回退会被拒绝。`
}

export const saleCopy = {
  label: '开放销售', first: '请先保存模型和积分，再开放销售。', active: '请先下架，再关闭销售。',
  opened: '已开放销售', closed: '已关闭销售',
}

export const catalogCopy = {
  priceGroup: '出图与价格', active: '已上架', inactive: '已下架', all: '全部',
  seriesFilter: '筛选系列', allSeries: '全部系列', single: '单个模板', groupSeries: '按系列分组',
  manageSeries: '系列管理', empty: '没有匹配的模板',
  status: '上架状态', category: '筛选分类', categories: '全部分类', search: '搜索中文名、英文名或 ID',
}
