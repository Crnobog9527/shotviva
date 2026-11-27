import type { ImageRef } from '@/core/content'
import type { Locale } from '@/core/i18n/locales'

import { withFirstFrame } from '../content/landing-shared'
import { photoSeconds } from '../content/offer'
import type { HeroOptionContent, LiveHeroScene } from './hero-options'

// Home hero option C, restaurants (Owner 2026-11-14: 「我选择窗口挑选出来的 8 组候选」). Eight real
// pairs of published food templates: a dish shot on a steel kitchen counter → the template's
// result, every one on the plain white plate it was served on, no Chinese props. The first pair
// is the first screen (its phone photo is the inline first frame, as today); the other seven sit
// in a row right under it, small and lazy. Every visitor on C sees the same first pair, so the
// group stays one demo. Pictures: public/home/food-<n>-{photo,ai}[-s].webp, all 4:5, cut from the
// templates' covers (wd-dappled-slate, wd-dark-flatlay, wd-rustic-board, wd-gingham-kitchen,
// wd-garden-daylight, fx-pastel-table, wd-white-leaf, fx-quiet-shadow).

const big = (file: string, alt: string): ImageRef => ({ src: `/home/${file}.webp`, alt, width: 880, height: 1100 })
const small = (file: string, alt: string): ImageRef => ({ src: `/home/${file}-s.webp`, alt, width: 320, height: 400 })

// `file`: the pictures' own name when the dish replaced another (a new name, so no cache keeps
// the old picture); otherwise `<prefix>-<n>`. `template`: the published template whose covers the
// pictures were cut from; while it is live the pair opens it (home-case-strip.ts), else it is a
// plain picture.
type Dish = { phone: string; ai: string; caption: string; template: string; file?: string }

// Pairs 2–8, in the order the Owner saw them.
const DISHES: Record<Locale, readonly Dish[]> = {
  en: [
    { phone: 'Real phone photo: spaghetti bolognese on a white plate on a steel kitchen counter', ai: 'Real example: the same spaghetti on its white plate, dark table, basil and tomatoes beside it', caption: 'Spaghetti, dark table', template: 'wd-dark-flatlay' },
    { phone: 'Real phone photo: sliced steak with fries and asparagus on a white plate in a kitchen', ai: 'Real example: the same steak plate on a rustic wooden board, warm light', caption: 'Steak, rustic board', template: 'wd-rustic-board' },
    { phone: 'Real phone photo: eggs Benedict on a white plate on a kitchen counter', ai: 'Real example: the same eggs Benedict on a gingham cloth with tomatoes on the vine', caption: 'Eggs Benedict, gingham', template: 'wd-gingham-kitchen' },
    { phone: 'Real phone photo: a chocolate lava cake with ice cream and berries on a white plate', ai: 'Real example: the same dessert in garden daylight, leaf shadows on the table', caption: 'Lava cake, garden light', template: 'wd-garden-daylight' },
    { phone: 'Real phone photo: noodles with minced meat and bok choy in a white bowl in a kitchen', ai: 'Real example: the same noodles on a peach backdrop with cherry tomatoes and a fork', caption: 'Noodles, peach table', template: 'fx-pastel-table' },
    { phone: 'Real phone photo: avocado toast with poached eggs on a white plate in a kitchen', ai: 'Real example: the same avocado toast in soft daylight with green leaves', caption: 'Avocado toast, daylight', template: 'wd-white-leaf' },
    { phone: 'Real phone photo: shrimp pad thai with lime on a white plate in a kitchen', ai: 'Real example: the same pad thai on a quiet grey backdrop with a soft shadow', caption: 'Pad thai, quiet grey', template: 'fx-quiet-shadow' },
  ],
  // Chinese dishes on /zh (Owner 2026-11-24), cut from published 中餐 templates' covers:
  // cn-camel-char-siu, cn-dark-claypot-walnut (it replaced cn-rattan-iron-wok, now a first-screen dish,
  // Owner 2026-11-25), cn-deep-maw-bowl (it replaced cn-warm-crab-plate, whose result was
  // landscape, Owner 2026-11-25), cn-ring-lobster-pour,
  // cn-green-wine-plate, cn-deep-lotus-crab, cn-warm-roast-straw (public/home/cn-food-<n>; the replacements cn-food-claypot and cn-food-crabmaw).
  zh: [
    { phone: '真实手机照：后厨不锈钢台面上，白色长盘里的叉烧', ai: '真实案例：同一盘叉烧放在驼色背景的原木上', caption: '叉烧，驼色原木', template: 'cn-camel-char-siu' },
    { phone: '真实手机照：后厨台面上，木板上的白砂锅，锅里是红油焖菜', ai: '真实案例：同一锅放在胡桃木板上，深色背景，热气升起', caption: '红油砂锅，胡桃木板', template: 'cn-dark-claypot-walnut', file: 'cn-food-claypot' },
    { phone: '真实手机照：后厨台面上，白色宽边汤盘里的蟹黄鱼肚，配两棵小青菜', ai: '真实案例：同一盘蟹黄鱼肚放在暖棕色桌上，热气升起', caption: '蟹黄鱼肚，暖棕', template: 'cn-deep-maw-bowl', file: 'cn-food-crabmaw' },
    { phone: '真实手机照：后厨台面上，冰盘里的龙虾刺身', ai: '真实案例：同一盘龙虾刺身放在年轮木块上', caption: '龙虾刺身，年轮木块', template: 'cn-ring-lobster-pour' },
    { phone: '真实手机照：后厨台面上，酒红深盘里的一道小炒', ai: '真实案例：同一盘小炒放在绿色桌面上，暖棕色背景，旁边一枝绿叶', caption: '小炒，酒红深盘', template: 'cn-green-wine-plate' },
    { phone: '真实手机照：后厨台面上，荷叶上的一只蒸蟹', ai: '真实案例：同一只蟹在荷叶盘里，暖棕色背景', caption: '荷叶蒸蟹，暖棕', template: 'cn-deep-lotus-crab' },
    { phone: '真实手机照：后厨台面上，稻草上的两只烤乳鸽', ai: '真实案例：同样的烤乳鸽摆在稻草上，暖棕色背景', caption: '烤乳鸽，稻草暖棕', template: 'cn-warm-roast-straw' },
  ],
}

// The /zh first screen: Chinese dishes taking turns, phone photo and result together, 2 s each
// (Owner 2026-11-24). The pictures are the templates' own current covers, read live (Owner
// 2026-11-25: 「跟着我们后台对应的模板原图和成品图来走」), so changing a cover in admin changes the
// first screen; a template that is no longer live drops out. The Owner picked templates whose two
// covers are portrait, so the 4:5 plates crop little. The words stay ours, written so a re-shot
// cover of the same dish still matches them.
const ZH_LIVE: readonly LiveHeroScene[] = [
  { templateId: 'cn-pedestal-fog', phone: '真实手机照：后厨不锈钢台面上，白色长盘里码着一排大虾', ai: '真实案例：同一盘大虾放在深色麻布高台上，烟雾缓缓流下，背后一抹暗红光', caption: '同一盘虾，直接能上菜单' },
  { templateId: 'cn-deep-prawn-green', phone: '真实手机照：后厨台面上，白盘里摆成一圈的油焖大虾', ai: '真实案例：同一盘油焖大虾放在青绿锦布上，深棕色背景', caption: '同一盘大虾，换上青绿锦布' },
  { templateId: 'cn-warm-lobed-runner', phone: '真实手机照：后厨台面上，白色花边椭圆深盘里的酱烤鱼', ai: '真实案例：同一盘酱烤鱼放在棕色锦纹桌旗上，年轮木墙做背景', caption: '同一盘烤鱼，换上锦纹桌旗' },
]

const COPY = {
  en: {
    before: 'Real phone photo: spaghetti carbonara on a white plate on a steel kitchen counter, stacked plates behind',
    after: 'Real example: the same carbonara on its white plate on a slate table in dappled sunlight, olive oil and herbs beside it',
    caption: 'Same plate, now ready for the menu',
    tagline: `For restaurants and hotels: snap a dish or a room on your phone and get menu, delivery-app and booking-site photos in about ${photoSeconds} seconds, no photographer.`,
    strip: 'More real dishes, each shot on a kitchen counter',
  },
  zh: {
    tagline: `专为餐厅和酒店打造：手机随手拍下菜品或客房，约 ${photoSeconds} 秒即可生成菜单、外卖平台和订房网站所需的专业图片，无需聘请摄影师。`,
    strip: '更多真实案例，原图都是在后厨台面上随手拍的',
  },
} as const

// The pictures' file prefix: Western dishes on the English page, Chinese ones on /zh.
const FILES: Record<Locale, string> = { en: 'food', zh: 'cn-food' }

// English: one static pair (food-1). /zh: the live dishes above, the static first dish as the fallback.
// When none of the live templates can be read (a catalogue outage, all of them unpublished, or a
// build without a database such as CI's), /zh still shows a Chinese dish, never the page's tote:
// the first dish's covers as they were on 2026-11-24 (public/home/cn-hero-1-*, 880 × 1100), with
// their first frame (scripts/first-frames.ts).
const ZH_FALLBACK: NonNullable<HeroOptionContent['hero']> = {
  before: withFirstFrame(big('cn-hero-1-photo', ZH_LIVE[0]!.phone)),
  after: big('cn-hero-1-ai', ZH_LIVE[0]!.ai),
  caption: ZH_LIVE[0]!.caption,
  scenes: undefined,
}

function heroIn(locale: Locale): Pick<HeroOptionContent, 'hero' | 'live'> {
  if (locale === 'zh') return { live: { label: '几道菜的手机照和成图', scenes: ZH_LIVE }, hero: ZH_FALLBACK }
  const copy = COPY.en
  return { hero: { before: withFirstFrame(big('food-1-photo', copy.before)), after: big('food-1-ai', copy.after), caption: copy.caption, scenes: undefined } }
}

function foodIn(locale: Locale): HeroOptionContent {
  const copy = COPY[locale]
  const file = FILES[locale]
  return {
    ...heroIn(locale),
    tagline: copy.tagline,
    generatorTemplate: 'wd-dappled-slate',
    strip: {
      heading: copy.strip,
      items: DISHES[locale].map((dish, index) => {
        const name = dish.file ?? `${file}-${index + 2}`
        return { before: small(`${name}-photo`, dish.phone), after: small(`${name}-ai`, dish.ai), caption: dish.caption, template: dish.template }
      }),
    },
  }
}

export const food: Record<Locale, HeroOptionContent> = { en: foodIn('en'), zh: foodIn('zh') }
