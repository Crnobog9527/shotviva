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
