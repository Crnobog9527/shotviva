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

// The category picker (DESIGN §7 admin is Chinese): each stored English name with its zh label,
// the same text as app.categories in zh.json (a unit test keeps them equal).
export const categoryCopy = {
  label: '分类',
  placeholder: '请选择分类',
  newOption: '新分类…',
  newLabel: '新分类的英文名（存进数据库，页面按英文名显示，中文名要另加到 zh.json）',
  offList: (stored: string) => `「${stored}」不是六个固定分类之一，Create 页会多出一个分类标签。确认是新分类再保存。`,
  zh: {
    'Food & Drink': '餐饮',
    'Products & Resale': '商品与二手',
    'Beauty & Skincare': '美妆护肤',
    'Rooms & Spaces': '房间与空间',
    Pets: '宠物',
    'Art Styles': '画风',
  },
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
  filtered: '清空搜索后可拖动排序',
  dragHint: '按住左边的把手上下拖动调整顺序；手机上长按整行再拖。',
} as const

// Batch edit (T79).
export const bulkEditCopy = {
  open: '批量编辑…',
  title: (count: number) => `批量编辑 ${count} 个模板`,
  hint: '只改填了或选了的项，留空 / 「不改」的保持每个模板原来的值。保存前逐个按积分下限检查，有一个不合格就整批不保存。',
  creditsLegend: '积分（每档单独填，留空不改）',
  floorHint: (high: number, medium: number) => `下限 high ${high} / medium ${medium}`,
  surfaces: '展示入口',
  surfaceOptions: { '': '不改', web: '只在站内', partner: '只给伙伴', both: '站内 + 伙伴' },
  quality: '出图质量（送给模型的 quality）',
  qualityOptions: { '': '不改', high: 'high', medium: 'medium' },
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
