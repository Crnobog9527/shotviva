import type { Fact, RelatedLink } from '@/core/content'

import { type OfferFacts, usd } from '../offer'
import {
  zhFreeImages,
  zhLanguages,
  zhTierPixels,
  zhUploadLimits,
} from './offer'

// The facts block of the /zh pages: the same facts as the English pages
// (建站规格 G3, G4), written natively, never machine-translated (G13).

function paidValue({ planFrom, packFrom }: OfferFacts): string {
  if (!planFrom) return packFrom ? `一次性积分包 ${usd(packFrom.priceUsd)} 起` : '套餐和积分包：价格即将公布'
  const packs = packFrom ? `；积分包 ${usd(packFrom.priceUsd)} 起，一次性付款` : ''
  return `套餐每月 ${usd(planFrom.priceUsd)} 起${packs}（美元）`
}

export function zhSharedFacts(offers: OfferFacts): readonly [Fact, Fact, Fact, ...Fact[]] {
  return [
    // 为什么选 Shotviva（Owner 2026-11-08）：两条核心卖点在前，然后是对比、适合谁、用在哪，最后是各页共用的数字。
    { label: '主体与原图一致', brief: true, value: '商品、标签、菜品本身、房间布局都保持你拍的样子，换的是光线、背景或场景；餐饮模板还可能换盘子或碗。' },
    { label: '一句话精准修改，像 PS 一样', value: '说「去掉桌上的杂物」或「换成晴天」，只改这一处；连改好几轮，原图也不走样。' },
    { label: '通用 AI 工具的常见问题', value: '整张图重画：标签上的字写错，菜不像你做的菜，房间里多出没见过的家具；每多改一次，离实物就更远一点。' },
    { label: '为什么能保持原图', value: '自研编辑引擎，基于领先的图像大模型。每次修改前先精准识别你要改的区域，其余部分全部锁定，不受影响。' },
    { label: '适合谁用', brief: true, value: '餐厅和咖啡店、网店卖家、民宿房东和房产中介、小品牌，以及所有需要照片和实物一致的商家' },
    { label: '用在哪里', brief: true, value: '菜单和外卖平台、电商商品图、房源和民宿照片、社交媒体和广告，也可以把满意的照片再精修一遍' },
    { label: '不需要什么', value: '不用影棚，不用设计师，也不用写提示词。选择模板，或用一句话说明要改的地方。' },
    { label: '免费试用', brief: true, value: `注册送 ${zhFreeImages}，只送一次` },
    { label: '出图尺寸', value: zhTierPixels },
    { label: '上传要求', value: zhUploadLimits },
    { label: '价格', brief: true, value: paidValue(offers) },
    { label: '免费图和付费图', value: '免费图公开展示并带水印（海报类作品只自己可见）；付费图私密、无水印' },
    { label: '界面语言', value: zhLanguages },
  ]
}

// 落地页「更多」的最后一张价格卡（差距审计 B10）。
export function zhPricingRelated(brand: string, { planFrom }: OfferFacts): RelatedLink {
  const note = planFrom ? `套餐每月 ${usd(planFrom.priceUsd)} 起，注册先送 ${zhFreeImages}。` : '月付、年付套餐和一次性积分包。'
  return { href: '/pricing', anchor: `${brand} 价格`, note }
}
