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
    { phone: 'Phone photo: spaghetti bolognese on a white plate on a steel kitchen counter', ai: 'Real example: the same spaghetti on its white plate, dark table, basil and tomatoes beside it', caption: 'Spaghetti, dark table' },
    { phone: 'Phone photo: sliced steak with fries and asparagus on a white plate in a kitchen', ai: 'Real example: the same steak plate on a rustic wooden board, warm light', caption: 'Steak, rustic board' },
    { phone: 'Phone photo: eggs Benedict on a white plate on a kitchen counter', ai: 'Real example: the same eggs Benedict on a gingham cloth with tomatoes on the vine', caption: 'Eggs Benedict, gingham' },
    { phone: 'Phone photo: a chocolate lava cake with ice cream and berries on a white plate', ai: 'Real example: the same dessert in garden daylight, leaf shadows on the table', caption: 'Lava cake, garden light' },
    { phone: 'Phone photo: noodles with minced meat and bok choy in a white bowl in a kitchen', ai: 'Real example: the same noodles on a peach backdrop with cherry tomatoes and a fork', caption: 'Noodles, peach table' },
    { phone: 'Phone photo: avocado toast with poached eggs on a white plate in a kitchen', ai: 'Real example: the same avocado toast in soft daylight with green leaves', caption: 'Avocado toast, daylight' },
    { phone: 'Phone photo: shrimp pad thai with lime on a white plate in a kitchen', ai: 'Real example: the same pad thai on a quiet grey backdrop with a soft shadow', caption: 'Pad thai, quiet grey' },
  ],
  zh: [
    { phone: '手机照片：后厨不锈钢台面上，白盘里的肉酱意面', ai: '真实案例：同一盘意面还在白盘里，深色桌面，旁边是罗勒和番茄', caption: '肉酱意面，深色桌面' },
    { phone: '手机照片：后厨里白盘装的切片牛排、薯条和芦笋', ai: '真实案例：同一盘牛排放在原木砧板上，暖光', caption: '牛排，原木砧板' },
    { phone: '手机照片：后厨台面上白盘里的班尼迪克蛋', ai: '真实案例：同一份班尼迪克蛋放在格子桌布上，旁边是串番茄', caption: '班尼迪克蛋，格子桌布' },
    { phone: '手机照片：白盘里的熔岩巧克力蛋糕，配冰淇淋和莓果', ai: '真实案例：同一份甜品在花园日光下，桌上有树叶的影子', caption: '熔岩蛋糕，花园日光' },
    { phone: '手机照片：后厨里白碗装的肉末青菜拌面', ai: '真实案例：同一碗面放在蜜桃色背景上，旁边是小番茄和叉子', caption: '拌面，蜜桃色桌面' },
    { phone: '手机照片：后厨里白盘装的牛油果吐司配水波蛋', ai: '真实案例：同一份牛油果吐司在柔和日光里，配绿叶', caption: '牛油果吐司，日光' },
    { phone: '手机照片：后厨里白盘装的鲜虾泰式炒河粉，配青柠', ai: '真实案例：同一盘炒河粉放在安静的灰色背景上，柔和的影子', caption: '泰式炒河粉，安静灰' },
  ],
}

const COPY = {
  en: {
    before: 'Phone photo: spaghetti carbonara on a white plate on a steel kitchen counter, stacked plates behind',
    after: 'Real example: the same carbonara on its white plate on a slate table in dappled sunlight, olive oil and herbs beside it',
    caption: 'Same plate, now ready for the menu',
    tagline: 'For restaurants and cafés: shoot a dish on the kitchen counter, get a menu-ready photo. Your plain white plate stays your plate.',
    strip: 'More real dishes, each shot on a kitchen counter',
  },
  zh: {
    before: '手机照片：后厨不锈钢台面上，白盘里的培根蛋酱意面，身后摞着盘子',
    after: '真实案例：同一盘意面还在白盘里，放在斑驳阳光下的石板桌上，旁边是橄榄油和香草',
    caption: '同一盘菜，直接能上菜单',
    tagline: '给餐厅和咖啡店：在后厨台面上随手拍一道菜，就能出可以上菜单的照片。你的白盘还是你的白盘。',
    strip: '更多真实菜品，都是在后厨台面上拍的',
  },
} as const

function foodIn(locale: Locale): HeroOptionContent {
  const copy = COPY[locale]
  return {
    hero: {
      before: withFirstFrame(big('food-1-photo', copy.before)),
      after: big('food-1-ai', copy.after),
      caption: copy.caption,
      // A single pair: the rotating scenes are the tote's (one phone photo, several results).
      scenes: undefined,
    },
    tagline: copy.tagline,
    generatorTemplate: 'wd-dappled-slate',
    strip: {
      heading: copy.strip,
      items: DISHES[locale].map((dish, index) => ({ before: small(`food-${index + 2}-photo`, dish.phone), after: small(`food-${index + 2}-ai`, dish.ai), caption: dish.caption })),
    },
  }
}

export const food: Record<Locale, HeroOptionContent> = { en: foodIn('en'), zh: foodIn('zh') }
