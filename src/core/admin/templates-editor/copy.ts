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
