// 分语言展示 on 首页展示's language tabs (migrations 1575, 2003). Admin is Chinese-only (DESIGN §7).
export const LOCALE_DISPLAY_COPY = {
  title: '分语言展示',
  body: '英文站和中文站可以各用一套首页模板分组顺序、创作页分类顺序和首页精选（首页生成器下方的模板也按它排）。没单独设置时，两边都跟着「模板与系列 › 分类」的顺序和「首页展示 › 默认」里的首页精选。改某一边只影响这一边，保存后大约一分钟内生效。SEO 页面和分类网址不受影响。',
  // On a 首页展示 language page (Owner 2026-11-27).
  titleFor: (locale: string) => `${locale}：分类顺序、首页精选和精选组合`,
  bodyFor: '这一边自己的首页分组和创作页分类顺序、首页精选（首页生成器下方的模板也按它排）和精选组合。没单独设置的部分跟随默认：分类顺序在「模板与系列 › 分类」，精选和组合在「默认」标签。改这一边只影响这一边，「编辑」后点「保存」一次生效，大约一分钟内更新。SEO 页面和分类网址不受影响。',
  expand: '展开分语言展示',
  collapse: '收起分语言展示',
  summary: (locale: string, groups: number, featured: boolean, bundles = false) =>
    groups === 0 && !featured && !bundles
      ? `${locale}：全部跟随默认`
      : `${locale}：${[groups ? `${groups} 组分类单独排序` : '', featured ? '精选单独设置' : '', bundles ? '组合单独设置' : ''].filter(Boolean).join('，')}`,
  locales: { en: '英文站', zh: '中文站' },
  following: '跟随默认',
  own: '已单独设置',
  reset: '恢复跟随默认',
  edit: '编辑',
  save: '保存',
  saving: '保存中…',
  cancel: '取消',
  editing: (locale: string) => `正在编辑${locale}。调整好后点「保存」一次生效，「取消」放弃这次的修改。`,
  dirty: '有未保存的修改',
  clean: '还没有修改',
  confirmDiscard: '有未保存的修改，确定放弃吗？',
  confirmSwitch: (locale: string) => `${locale}有未保存的修改，切换会放弃这些修改。确定切换吗？`,
  confirmLeave: '分语言展示有未保存的修改，确定离开这个页面吗？',
  categoriesTitle: '分类顺序（首页分组和创作页分类条）',
  categoriesHint: '只有同级至少两个分类才需要排序。',
  categoriesEditHint: '拖动或用上下箭头调整，点「保存」后一起生效。',
  featuredTitle: '首页精选',
  featuredHint: '这一边有自己的精选列表。列表清空后回到跟随默认。',
  featuredFollowing: (count: number) => `现在跟随默认精选（${count} 个）。编辑后会以当前内容为起点，保存为这一边自己的列表。`,
  featuredEmpty: '还没有精选模板。',
  remove: (name: string) => `从精选移除 ${name}`,
  saved: (locale: string) => `已保存${locale}的设置`,
  failed: '这次的修改都没有生效，草稿还在，可以改好后再保存。',
} as const
