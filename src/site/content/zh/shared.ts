import type { Fact, RelatedLink } from '@/core/content'

import { packFrom, planFrom, usd } from '../offer'
import {
  zhFreeImages,
  zhFromCredits,
  zhLanguages,
  zhTierPixels,
  zhUploadLimits,
} from './offer'

// The facts block of the /zh pages: the same facts as the English pages
// (建站规格 G3, G4), written natively, never machine-translated (G13).

function paidValue(): string {
  if (!planFrom) return '套餐和积分包：价格即将公布'
  const packs = packFrom ? `；积分包 ${usd(packFrom.priceUsd)} 起，一次性付款` : ''
  return `套餐每月 ${usd(planFrom.priceUsd)} 起${packs}（美元）`
}

export function zhSharedFacts(): readonly [Fact, Fact, Fact, ...Fact[]] {
  return [
    // 为什么选 Shotviva（Owner 2026-11-08）：两条核心卖点在前，然后是对比、适合谁、用在哪，最后是各页共用的数字。
    { label: '你拍的是什么，出来还是什么', value: '商品、标签、摆盘、房间布局都和你拍的一样，只换光线、背景或场景。' },
    { label: '像 PS 一样改，说一句话就行', value: '说「去掉桌上的杂物」或「换成晴天」，只改这一处；连改好几轮，原图也不走样。' },
    { label: '别的 AI 工具常见的问题', value: '整张图重画：标签上的字写错，菜不像你做的菜，房间里多出没见过的家具；每多改一次，离实物就更远一点。' },
    { label: '为什么这里能保住原图', value: '自主研发的编辑引擎，跑在全球顶级的图片大模型上。每次修改前先弄清你要改的到底是哪一处，其余部分全部锁住。' },
    { label: '适合谁用', value: '餐厅和咖啡店、网店卖家、民宿房东和房产中介、小品牌，以及所有照片必须和实物一致的人' },
    { label: '用在哪里', value: '菜单和外卖平台、电商商品图、房源和民宿照片、社交媒体和广告，或者把一张本来就喜欢的照片再修好一点' },
    { label: '不需要什么', value: '不用影棚，不用设计师，也不用写提示词。选个模板，或者写一句要改哪里。' },
    { label: '免费试用', value: `注册送 ${zhFreeImages}，只送一次` },
    { label: '每张消耗', value: `${zhFromCredits}（标准清晰度）` },
    { label: '出图尺寸', value: zhTierPixels },
    { label: '上传要求', value: zhUploadLimits },
    { label: '价格', value: paidValue() },
    { label: '免费图和付费图', value: '免费图公开展示并带水印；付费图私密、无水印' },
    { label: '界面语言', value: zhLanguages },
  ]
}

// 落地页「更多」的最后一张价格卡（差距审计 B10）。
export function zhPricingRelated(brand: string): RelatedLink {
  const note = planFrom ? `套餐每月 ${usd(planFrom.priceUsd)} 起，注册先送 ${zhFreeImages}。` : '月付、年付套餐和一次性积分包。'
  return { href: '/pricing', anchor: `${brand} 价格`, note }
}
