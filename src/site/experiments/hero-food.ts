import type { ImageRef } from '@/core/content'
import type { Locale } from '@/core/i18n/locales'

import { withFirstFrame } from '../content/landing-shared'
import type { HeroOptionContent } from './hero-options'

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

type Dish = { phone: string; ai: string; caption: string }

// Pairs 2–8, in the order the Owner saw them.
const DISHES: Record<Locale, readonly Dish[]> = {
  en: [
    { phone: 'Real phone photo: spaghetti bolognese on a white plate on a steel kitchen counter', ai: 'Real example: the same spaghetti on its white plate, dark table, basil and tomatoes beside it', caption: 'Spaghetti, dark table' },
    { phone: 'Real phone photo: sliced steak with fries and asparagus on a white plate in a kitchen', ai: 'Real example: the same steak plate on a rustic wooden board, warm light', caption: 'Steak, rustic board' },
    { phone: 'Real phone photo: eggs Benedict on a white plate on a kitchen counter', ai: 'Real example: the same eggs Benedict on a gingham cloth with tomatoes on the vine', caption: 'Eggs Benedict, gingham' },
    { phone: 'Real phone photo: a chocolate lava cake with ice cream and berries on a white plate', ai: 'Real example: the same dessert in garden daylight, leaf shadows on the table', caption: 'Lava cake, garden light' },
    { phone: 'Real phone photo: noodles with minced meat and bok choy in a white bowl in a kitchen', ai: 'Real example: the same noodles on a peach backdrop with cherry tomatoes and a fork', caption: 'Noodles, peach table' },
    { phone: 'Real phone photo: avocado toast with poached eggs on a white plate in a kitchen', ai: 'Real example: the same avocado toast in soft daylight with green leaves', caption: 'Avocado toast, daylight' },
    { phone: 'Real phone photo: shrimp pad thai with lime on a white plate in a kitchen', ai: 'Real example: the same pad thai on a quiet grey backdrop with a soft shadow', caption: 'Pad thai, quiet grey' },
  ],
  // Chinese dishes on /zh (Owner 2026-11-24), cut from published 中餐 templates' covers:
  // cn-camel-char-siu, cn-rattan-iron-wok, cn-warm-crab-plate, cn-ring-lobster-pour,
  // cn-green-wine-plate, cn-deep-lotus-crab, cn-warm-roast-straw (public/home/cn-food-<n>).
  zh: [
    { phone: '真实手机照：后厨不锈钢台面上，白色长盘里的叉烧', ai: '真实案例：同一盘叉烧放在驼色背景的原木上', caption: '叉烧，驼色原木' },
    { phone: '真实手机照：后厨台面上，黑铁双柄锅里的番茄牛腩', ai: '真实案例：同一锅番茄牛腩放在雕花木板上，旁边是番茄', caption: '番茄牛腩，雕花木板' },
    { phone: '真实手机照：后厨台面上，白色宽边盘里的葱姜炒蟹', ai: '真实案例：同一盘炒蟹放在亚麻桌布上，暖光', caption: '葱姜炒蟹，亚麻布' },
    { phone: '真实手机照：后厨台面上，冰盘里的龙虾刺身', ai: '真实案例：同一盘龙虾刺身放在年轮木块上', caption: '龙虾刺身，年轮木块' },
    { phone: '真实手机照：后厨台面上，酒红深盘里的一道小炒', ai: '真实案例：同一盘小炒放在暖棕色的绿色台面上', caption: '小炒，酒红深盘' },
    { phone: '真实手机照：后厨台面上，荷叶上的一只蒸蟹', ai: '真实案例：同一只蟹在荷叶盘里，暖棕色背景', caption: '荷叶蒸蟹，暖棕' },
    { phone: '真实手机照：后厨台面上，稻草上的两只烤乳鸽', ai: '真实案例：同样的烤乳鸽摆在稻草上，暖棕色背景', caption: '烤乳鸽，稻草暖棕' },
  ],
}

const COPY = {
  en: {
    before: 'Real phone photo: spaghetti carbonara on a white plate on a steel kitchen counter, stacked plates behind',
    after: 'Real example: the same carbonara on its white plate on a slate table in dappled sunlight, olive oil and herbs beside it',
    caption: 'Same plate, now ready for the menu',
    tagline: 'For restaurants and hotels: snap a dish or a room on your phone and get menu, delivery-app and booking-site photos in about 30 seconds, no photographer.',
    strip: 'More real dishes, each shot on a kitchen counter',
  },
  zh: {
    before: '真实手机照：后厨不锈钢台面上，竹笼里码着一排大虾，旁边是蘸碟',
    after: '真实案例：同一笼大虾放在暗调木桌上，暖光',
    caption: '同一笼虾，直接能上菜单',
    tagline: '给餐厅和酒店：随手拍一道菜或一间客房，约 30 秒出菜单、外卖和订房网站用的图，不用请摄影师。',
    strip: '更多真实菜品，都是在后厨台面上拍的',
  },
} as const

// The pictures' file prefix: Western dishes on the English page, Chinese ones on /zh.
const FILES: Record<Locale, string> = { en: 'food', zh: 'cn-food' }

function foodIn(locale: Locale): HeroOptionContent {
  const copy = COPY[locale]
  const file = FILES[locale]
  return {
    hero: {
      before: withFirstFrame(big(`${file}-1-photo`, copy.before)),
      after: big(`${file}-1-ai`, copy.after),
      caption: copy.caption,
      // A single pair: the rotating scenes are the tote's (one phone photo, several results).
      scenes: undefined,
    },
    tagline: copy.tagline,
    generatorTemplate: 'wd-dappled-slate',
    strip: {
      heading: copy.strip,
      items: DISHES[locale].map((dish, index) => ({ before: small(`${file}-${index + 2}-photo`, dish.phone), after: small(`${file}-${index + 2}-ai`, dish.ai), caption: dish.caption })),
    },
  }
}

export const food: Record<Locale, HeroOptionContent> = { en: foodIn('en'), zh: foodIn('zh') }
