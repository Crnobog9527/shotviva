import type { TemplateCategory } from '@/core/content'

// The first template batch on the /zh home page (ARCHITECTURE §5), same order as English: Art
// Styles first (建站规格 §4 H2-2). Names here are the Chinese template names; the database
// copies live in templates.translations (T21 PR 3). Style names describe a style only, never
// a studio or a work (ARCHITECTURE §5).
export const zhTemplateCategories: readonly [TemplateCategory, ...TemplateCategory[]] = [
  {
    name: '画风',
    drag: true,
    intro: '照片转动漫、转插画都行，姿势、构图和主体都不变。',
    templates: [{ id: 'korean-manhwa', name: '韩漫画风', use: '用干净的韩漫画风重画你的照片，姿势和取景保持原样。' }],
  },
  {
    name: '餐饮',
    intro: '手机拍的菜品和饮品，直接做成菜单图或海报，菜和盘子保持原样。',
    templates: [
      { id: 'delivery-photo', name: '外卖菜单', use: '明亮干净的菜品图，适合外卖平台和菜单。' },
      { id: 'dark-dining', name: '暗调氛围', use: '低调的暗光氛围，适合发晚餐和饮品的社交媒体。' },
      { id: 'promo-poster', name: '促销海报', use: '一张海报：你的照片，加一句标题和一个价格。' },
    ],
  },
  {
    name: '商品与二手',
    intro: '商品随便放在桌上拍，就能出能上架的图，标签、颜色和形状都不变。',
    templates: [
      { id: 'pure-white', name: '纯白底图', use: '网店和二手平台用的白底主图。' },
      { id: 'lifestyle-table', name: '生活场景', use: '把商品放进布置好的桌面场景，适合发社交媒体。' },
    ],
  },
  {
    name: '美妆护肤',
    intro: '把手机照片里的瓶子、罐子或软管放到干净的品牌展台上，包装保持原样。',
    templates: [{ id: 'spa-podium', name: '水疗展台', use: '柔和的水疗风展台，适合护肤和美妆产品。' }],
  },
  {
    name: '房间与空间',
    intro: '让房间照片更亮或更暖，墙、窗户和家具都在原来的位置。',
    templates: [
      { id: 'bright-listing', name: '明亮房源', use: '让出租房源图更亮、更干净，不改房间结构。' },
      { id: 'evening-glow', name: '傍晚暖光', use: '傍晚的暖色灯光，看起来更温馨。' },
    ],
  },
  {
    name: '宠物',
    intro: '把宠物的随手拍变成影棚写真，你家的宠物还是你家的样子。',
    templates: [{ id: 'pet-studio', name: '宠物写真', use: '柔光加纯色背景的影棚写真。' }],
  },
]
