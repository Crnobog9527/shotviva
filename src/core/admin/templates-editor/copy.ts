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
  hint: '要新增分类或改名，在本页上方的「分类管理」里改。',
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
