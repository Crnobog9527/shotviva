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
    { label: '保持不变的', value: '你拍的主体：形状、颜色、标签、摆盘或房间布局' },
    { label: '模板改变的', value: '光线、背景、场景或画风' },
    { label: '免费试用', value: `注册送 ${zhFreeImages}，只送一次` },
    { label: '每张消耗', value: `${zhFromCredits}（标准清晰度）` },
    { label: '出图尺寸', value: zhTierPixels },
    { label: '上传要求', value: zhUploadLimits },
    { label: '价格', value: paidValue() },
    { label: '免费图和付费图', value: '免费图公开展示并带水印；付费图私密、无水印' },
    { label: '提示词', value: '不用写，选模板就行' },
    { label: '界面语言', value: zhLanguages },
  ]
}

// 落地页「更多」的最后一张价格卡（差距审计 B10）。
export function zhPricingRelated(brand: string): RelatedLink {
  const note = planFrom ? `套餐每月 ${usd(planFrom.priceUsd)} 起，注册先送 ${zhFreeImages}。` : '月付、年付套餐和一次性积分包。'
  return { href: '/pricing', anchor: `${brand} 价格`, note }
}
