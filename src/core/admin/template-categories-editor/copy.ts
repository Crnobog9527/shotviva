import { CATEGORY_LIMITS } from '@/core/templates/categories'

// 分类管理 on /admin/templates (ARCHITECTURE §5 「模板分类由后台管理」, T75). Admin is
// Chinese-only (DESIGN §7).
export const CATEGORIES_COPY = {
  title: '分类管理',
  body: '创作页的分类条和首页的模板分组都按这里的顺序和名称显示。没有已上架模板的分类不会出现在页面上。改名只改显示，标识不变。',
  add: '新增分类',
  empty: '还没有分类。',
  moveUp: (name: string) => `上移 ${name}`,
  moveDown: (name: string) => `下移 ${name}`,
  edit: '编辑',
  remove: '删除',
  noIntro: '没有首页说明',
  count: (n: number) => (n === 0 ? '没有模板' : `${n} 个模板`),
  style: { pair: '并排对比', compare: '拖动对比' },
  saved: (name: string) => `已保存「${name}」`,
  reordered: '分类顺序已保存',
  deleted: (name: string, moved: number, to: string | null) =>
    moved > 0 && to ? `已删除「${name}」，${moved} 个模板移到了「${to}」` : `已删除「${name}」`,
  form: {
    newTitle: '新增分类',
    editTitle: (name: string) => `编辑「${name}」`,
    nameZh: `中文名称（最多 ${CATEGORY_LIMITS.nameZh} 个字）`,
    nameEn: `英文名称（最多 ${CATEGORY_LIMITS.nameEn} 个字符）`,
    key: '标识（英文小写、数字和短横线，保存后不能改）',
    keyHint: '页面地址、数据统计都认这个标识。默认按英文名称生成。',
    keyFixed: '标识创建后不能改',
    introZh: '中文首页说明（选填）',
    introEn: '英文首页说明（选填）',
    introHint: '显示在首页这个分类的标题下面。留空就不显示说明。',
    style: '模板卡片样式',
    styleHint: {
      pair: '手机原图和 AI 结果并排放（大多数分类）。',
      compare: '一张图左右拖动对比（现在只有「画风」用）。',
    },
    cancel: '取消',
    save: '保存',
    saving: '保存中…',
    invalid: '中英文名称都要填，标识只能用英文小写字母、数字和短横线。',
  },
  removeDialog: {
    title: (name: string) => `删除「${name}」？`,
    unused: '没有模板用这个分类，删除后创作页和首页不再有它。',
    used: (n: number) => `有 ${n} 个模板（含未上架的）在用这个分类。删除前要把它们移到另一个分类，移动和删除一起完成。`,
    moveTo: '把这些模板移到',
    pick: '请选择分类',
    last: '这是最后一个分类，至少要保留一个，不能删除。',
    cancel: '取消',
    confirm: '确认删除',
    confirmMove: '移动模板并删除',
  },
} as const
