import type { HomePage, ImageRef } from '@/core/content'

import { caseImage, dishImage, homeImage } from '../landing-shared'
import { ZH_TIERS, zhTierList, zhUploadLimits } from './offer'

// /zh 首页的两个「怎么做」区块，每一点先给图、再用一行字说明（Owner 2026-11-12：看图比读大段文字快）：
// 三步和「白底图、电商主图怎么做」。

// The same tote set as the English home (public/home/hero-set-*.webp), shared with
// the hero and the shoot demo.
export const zhTote = {
  phone: homeImage('hero-set-phone', '真实手机照：厨房台面上的一只编织皮托特包，窗边自然光'),
  listing: homeImage('hero-set-listing', '同一只编织皮托特包的白底商品图，柔和影棚光（真实案例）'),
  lifestyle: homeImage('hero-set-lifestyle', '同一只包放在窗边的咖啡馆椅子上，早晨暖光（真实案例）'),
  promo: homeImage('hero-set-promo', '同一只包做成新品促销海报，明亮影棚光（真实案例）'),
} as const satisfies Record<string, ImageRef>

// The steps' pictures (Owner 2026-11-24: Chinese dishes on /zh): a dish shot on the kitchen
// counter and three published 中餐 templates (cn-branch-prawn-basket, cn-pedestal-fog,
// cn-ring-lotus-oval), the first of them the one picked.
const zhDish = {
  phone: dishImage('cn-food-1-photo', '真实手机照：后厨不锈钢台面上，竹笼里码着一排大虾'),
  basket: dishImage('cn-food-1-ai', '真实案例：同一笼大虾放在暗调木桌上，暖光'),
  fog: { src: '/home/cn-step-fog-s.webp', alt: '真实案例：一道中餐放在高台上，四周是烟雾', width: 320, height: 400 },
  lotus: { src: '/home/cn-step-lotus-s.webp', alt: '真实案例：一盘藕卷放在年轮木块上', width: 320, height: 400 },
}

const [standard, hd, max] = ZH_TIERS
const tiers = [standard, hd, max] as const
const sizesAlt = (subject: string) => `${subject}，${tiers.map((tier) => `${tier.name} ${tier.px}`).join('、')} px 三档尺寸对比`
const picked = (name: string) => `在模板列表里选中了「${name}」`

export const zhSteps = {
  heading: 'AI改图怎么用：3 步完成',
  items: [
    {
      heading: '上传一张照片',
      text: `用手机拍一张，或从相册选择：${zhUploadLimits}。拍摄时请让菜品或商品完整入镜。`,
      visual: { kind: 'upload', image: zhDish.phone, file: 'IMG_3112.jpg' },
    },
    {
      heading: '选一个模板',
      text: '餐饮、商品、美妆、房间、宠物或画风，光线和场景由模板设定好，无需输入任何文字。',
      visual: {
        kind: 'picker',
        tiles: [
          { image: zhDish.basket, name: '中餐 · 鳌虾竹笼' },
          { image: zhDish.fog, name: '中餐 · 高台烟雾' },
          { image: zhDish.lotus, name: '中餐 · 年轮木块藕卷盘' },
        ],
        picked: 0,
        caption: picked('中餐 · 鳌虾竹笼'),
      },
    },
    {
      heading: `下载 ${zhTierList}`,
      text: `${standard.name}适合${standard.use}，${hd.name}适合${hd.use}，${max.name}适合${max.use}。`,
      visual: { kind: 'sizes', image: { ...zhDish.basket, alt: sizesAlt('同一笼大虾的暗调暖光图') }, tiers },
    },
  ],
} as const satisfies HomePage['steps']

// The /zh/commercial-photography sneaker, with that page's own alt text.
const sneaker = {
  phone: caseImage('sneaker-phone', '真实手机照：玄关木地板上的一只米白色皮面运动鞋，后跟是灰绿色麂皮，早晨阳光很硬，钥匙和打开的鞋盒都入镜了'),
  listing: caseImage('sneaker-listing', '真实案例：同一只鞋的纯白底商品主图，柔和影棚光'),
  lifestyle: caseImage('sneaker-lifestyle', '真实案例：同一只鞋放在阳光下咖啡馆门口的水泥台阶上，身后是虚化的亚麻外套'),
  promo: caseImage('sneaker-promo-zh', '真实案例：同一只鞋悬浮在灰绿色背景上，做成写着「新品上市 百搭小白鞋」的促销海报'),
} as const satisfies Record<string, ImageRef>

// 「白底图、电商主图怎么做」 (SEO launch handbook G9): the white-background template, the
// product kept as shot, and the three export sizes.
export const whiteBackgroundGuide = {
  id: 'white-bg',
  heading: '白底图、电商主图怎么做',
  cards: [
    {
      heading: '选「纯白底图」模板',
      text: '上传一张商品照片，选「纯白底图」，背景换成干净的纯白。不用自己抠图，也不用写提示词。',
      visual: {
        kind: 'picker',
        tiles: [
          { image: sneaker.listing, name: '纯白底图' },
          { image: sneaker.lifestyle, name: '生活场景' },
          { image: sneaker.promo, name: '促销海报' },
        ],
        picked: 0,
        caption: picked('纯白底图'),
      },
    },
    {
      heading: '商品本身不变',
      text: '形状、颜色、标签和文字按你拍的样子保留，只换背景和光线。',
      visual: { kind: 'pair', before: sneaker.phone, after: sneaker.listing, tags: { before: '真实手机照', after: '纯白底图' } },
    },
    {
      heading: `${ZH_TIERS.length} 档导出尺寸`,
      text: '每张图都导出 PNG。主图需要放大看细节时，选择更高一档即可。',
      visual: { kind: 'sizes', image: { ...sneaker.listing, alt: sizesAlt('同一只鞋的纯白底电商主图') }, tiers },
    },
  ],
} as const satisfies HomePage['topics']
