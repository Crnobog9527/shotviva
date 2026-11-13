// Admin-only copy (DESIGN §7) for the editor's category tree, its sections and the right panel.
export const pickerCopy = {
  search: '搜索分类（中文、英文或 key）',
  expandAll: '全部展开',
  collapseAll: '全部收起',
  noMatch: '没有匹配的分类',
  expand: (name: string) => `展开「${name}」`,
  collapse: (name: string) => `收起「${name}」`,
  close: '收起列表',
} as const

export const SECTION_IDS = ['basic', 'category', 'covers', 'prompt', 'pricing', 'form', 'advanced'] as const
export type SectionId = (typeof SECTION_IDS)[number]

export const sectionCopy: Record<SectionId, string> = {
  basic: '基本信息',
  category: '分类与系列',
  covers: '封面与参考图',
  prompt: '提示词与版本',
  pricing: '模型、价格与销售',
  form: '创作页字段与开关',
  advanced: '高级',
}

export const sectionNavCopy = {
  label: '跳到分区',
  openAll: '全部展开',
  closeAll: '全部收起',
} as const

export const sidePanelCopy = {
  label: '右侧面板',
  testRun: '试跑',
  preview: '实时预览',
  desktop: '电脑',
  phone: '手机',
  widthLabel: '预览宽度',
  hint: '用表单里还没保存的内容，按用户打开模板时看到的弹窗画出来；只能看，不能上传或生成。',
  staleFields: '字段定义、用户字段或开关还没填完整，下面先按已保存的样子显示。',
  newTemplate: '保存模板后才能预览：预览要用到封面和分类。',
  inactive: '这个模板还没上架，用户现在看不到；预览按上架后的样子画。',
} as const
