import type { DishCategory } from '@/core/templates/food-flow'

// The vessel library page (ARCHITECTURE §5.1c「器皿图库」). Admin pages are Chinese only (DESIGN §7).
export const dishwareCopy = {
  title: '器皿图库',
  intro: '餐饮模板开「优化器皿」时，按认菜得出的菜形类别随机挑一只。形状描述会原样写进提示词：只写器型、釉色、质感，不写菜名或具体食物。',
  empty: '这一类还没有器皿',
  label: '名称（只在后台显示）',
  category: '菜形类别',
  shape: '一句话形状描述（英文，写进提示词）',
  active: '在用',
  inactive: '已停用',
  save: '保存',
  saving: '保存中…',
  saved: '已保存',
  remove: '删除',
  confirmRemove: '确定删除这只器皿？图片会一起删掉，不能恢复。',
  uploadTitle: '新增器皿',
  pickImage: '选择图片（JPEG / PNG / WebP，不超过 20MB）',
  upload: '上传并保存',
  uploading: '上传中…',
  syncNote: '正式站的图库由总控在 GitHub Actions 运行「Sync vessel library to production」，从测试站同步过去。',
} as const

export const CATEGORY_NAMES: Record<DishCategory, string> = {
  long: '长形菜（整鱼、长盘）',
  soup_stew: '汤羹炖菜',
  stir_fry: '小炒块状',
  dim_sum: '点心',
  cold: '冷盘',
  noodle_rice: '面饭',
}
