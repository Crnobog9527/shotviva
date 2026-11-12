import type { HomePage, ImageRef } from '@/core/content'

import { caseImage, homeImage } from '../landing-shared'
import { ZH_TIERS, zhTierList, zhUploadLimits } from './offer'

// /zh 首页的两个「怎么做」区块，每一点先给图、再用一行字说明（Owner 2026-11-12：看图比读大段文字快）：
// 三步和「白底图、电商主图怎么做」。

// The same illustrative tote set as the English home (public/home/hero-set-*.webp), shared with
// the hero and the shoot demo.
export const zhTote = {
  phone: homeImage('hero-set-phone', '手机随手拍：厨房台面上的一只编织皮托特包，窗边自然光（示意图）'),
  listing: homeImage('hero-set-listing', '同一只编织皮托特包的白底商品图，柔和影棚光（示意图）'),
  lifestyle: homeImage('hero-set-lifestyle', '同一只包放在窗边的咖啡馆椅子上，早晨暖光（示意图）'),
  promo: homeImage('hero-set-promo', '同一只包做成新品促销海报，明亮影棚光（示意图）'),
} as const satisfies Record<string, ImageRef>

const [standard, hd, max] = ZH_TIERS
const tiers = [standard, hd, max] as const
const sizesAlt = (subject: string) => `${subject}，${tiers.map((tier) => `${tier.name} ${tier.px}`).join('、')} px 三档尺寸示意`
const picked = (name: string) => `在模板列表里选中了「${name}」`

export const zhSteps = {
  heading: 'AI改图怎么用：3 步完成',
  items: [
    {
      heading: '上传一张照片',
      text: `手机拍一张，或者从相册里选：${zhUploadLimits}。让主体完整地留在画面里。`,
      visual: { kind: 'upload', image: zhTote.phone, file: 'IMG_2047.jpg' },
    },
    {
      heading: '选一个模板',
      text: '餐饮、商品、美妆、房间、宠物或画风，光线和场景由模板决定，什么都不用写。',
      visual: {
        kind: 'picker',
        tiles: [
          { image: zhTote.listing, name: '纯白底图' },
          { image: zhTote.lifestyle, name: '生活场景' },
          { image: zhTote.promo, name: '促销海报' },
        ],
        picked: 1,
        caption: picked('生活场景'),
      },
    },
    {
      heading: `下载 ${zhTierList}`,
      text: `${standard.name}适合${standard.use}，${hd.name}适合${hd.use}，${max.name}适合${max.use}。`,
      visual: { kind: 'sizes', image: { ...zhTote.lifestyle, alt: sizesAlt('同一只包的生活场景图') }, tiers },
    },
  ],
} as const satisfies HomePage['steps']

// The /zh/commercial-photography sneaker, with that page's own alt text.
const sneaker = {
  phone: caseImage('sneaker-phone', '示例手机照：玄关木地板上的一只米白色皮面运动鞋，后跟是灰绿色麂皮，早晨阳光很硬，钥匙和打开的鞋盒都入镜了'),
  listing: caseImage('sneaker-listing', 'AI 示例：同一只鞋的纯白底商品主图，柔和影棚光'),
  lifestyle: caseImage('sneaker-lifestyle', 'AI 示例：同一只鞋放在阳光下咖啡馆门口的水泥台阶上，身后是虚化的亚麻外套'),
  promo: caseImage('sneaker-promo-zh', 'AI 示例：同一只鞋悬浮在灰绿色背景上，做成写着「新品上市 百搭小白鞋」的促销海报'),
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
      heading: '商品主体保持原样',
      text: '形状、颜色、标签和文字按你拍的样子保留，只换背景和光线。',
      visual: { kind: 'pair', before: sneaker.phone, after: sneaker.listing, tags: { before: '手机实拍', after: '纯白底图' } },
    },
    {
      heading: `${ZH_TIERS.length} 档导出尺寸`,
      text: '每张图导出为 PNG。主图需要放大看细节时，选更高一档。',
      visual: { kind: 'sizes', image: { ...sneaker.listing, alt: sizesAlt('同一只鞋的纯白底电商主图') }, tiers },
    },
  ],
} as const satisfies HomePage['topics']
