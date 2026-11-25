import { HERO_CAPTION_MAX } from '@/core/templates/home-hero'

// 首页首屏大图 on /admin/templates (migration 2007). Admin is Chinese-only (DESIGN §7).
export const HERO_COPY = {
  title: '首页 · 首屏大图',
  body: '首页标题旁边那组「真实手机照 | AI」大图。放 1 个模板就固定显示它，放 2 到 6 个就轮流播放。图片直接用模板的前图和效果图；说明默认用模板在这一边的名称，也可以自己写一句（60 字以内）。「默认」是所有语言共用的设置；某个语言自己设置了就用自己的，没设置就跟随默认；默认也没设置时显示内置的首屏图。保存后大约一分钟内生效。只影响首页，A/B 实验页（/x/hero/…）仍用各自的图。',
  scopeDefault: '默认',
  count: (count: number, max: number) => `${count} / ${max} 个模板`,
  mode: (count: number) => (count === 0 ? '' : count === 1 ? '固定显示一组' : `${count} 组轮播`),
  followingDefault: (count: number) => (count ? `现在跟随默认（${count} 个模板）。编辑后保存为这一边自己的设置，清空后回到跟随默认。` : '现在跟随默认，默认也没设置，显示内置的首屏图。'),
  builtIn: '还没设置，没有自己设置的语言显示内置的首屏图。',
  own: '这一边自己的设置。清空后回到跟随默认。',
  defaultOwn: '默认设置：没有自己设置的语言都用它。清空后显示内置的首屏图。',
  notLive: '已下架，首页不显示',
  noCovers: '缺封面，不会显示',
  captionLabel: (name: string) => `${name} 的说明`,
  captionHint: (name: string) => `默认：${name}`,
  captionMax: HERO_CAPTION_MAX,
  remove: (name: string) => `从首屏大图移除 ${name}`,
  full: '已经放满 6 个，先移除一个再添加。',
  clear: '清空',
  saved: (scope: string) => `已保存「${scope}」的首屏大图`,
  confirmLeave: '首屏大图有未保存的修改，确定离开这个页面吗？',
  confirmSwitch: (scope: string) => `「${scope}」有未保存的修改，切换会放弃这些修改。确定切换吗？`,
  picker: {
    open: '添加模板',
    title: (scope: string) => `添加到「${scope}」首屏大图`,
    description: '只列出已上架、在网站上显示的模板。可以多选，按勾选顺序排在后面，再点「保存」一起生效。',
    add: (count: number) => (count ? `加入（${count}）` : '加入'),
  },
} as const
