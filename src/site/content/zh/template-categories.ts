import type { CategoryCopy } from '@/core/content'

// The /zh copy of the six categories (ARCHITECTURE §5), same keys and order as English.
export const zhTemplateCategories: readonly [CategoryCopy, ...CategoryCopy[]] = [
  { key: 'Art Styles', name: '画风', drag: true, intro: '照片转动漫、转插画都行，姿势、构图和主体都不变。' },
  { key: 'Food & Drink', name: '餐饮', intro: '手机拍的菜品和饮品，直接做成菜单图或海报，菜和盘子保持原样。' },
  { key: 'Products & Resale', name: '商品与二手', intro: '商品随便放在桌上拍，就能出能上架的图，标签、颜色和形状都不变。' },
  { key: 'Beauty & Skincare', name: '美妆护肤', intro: '把手机照片里的瓶子、罐子或软管放到干净的品牌展台上，包装保持原样。' },
  { key: 'Rooms & Spaces', name: '房间与空间', intro: '让房间照片更亮或更暖，墙、窗户和家具都在原来的位置。' },
  { key: 'Pets', name: '宠物', intro: '把宠物的随手拍变成影棚写真，你家的宠物还是你家的样子。' },
]
