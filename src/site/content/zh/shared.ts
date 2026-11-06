import type { CostTable, Fact, HeroBlock } from '@/core/content'

import { site } from '../../site.config'
import { packFrom, planFrom, usd } from '../offer'
import { placeholderHero } from '../shared'
import {
  zhFreeImages,
  zhFromCredits,
  zhLanguages,
  zhPhotographerRate,
  zhSetCredits,
  zhTierPixels,
  zhUploadLimits,
} from './offer'

// The facts block and cost table of the /zh pages: the same facts as the English pages
// (建站规格 G3, G4), written natively, never machine-translated (G13).

const brand = site.brand.name

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

export function zhSharedCostTable(): CostTable {
  const plans = planFrom ? `，套餐每月 ${usd(planFrom.priceUsd)} 起` : ''
  return {
    caption: `请摄影师、自己拍和用 ${brand} 的对比`,
    headers: { item: '对比项', photographer: '请摄影师', diy: '自己拍', site: brand },
    rows: [
      {
        item: '价格',
        photographer: `${zhPhotographerRate}，另加预约费`,
        diy: '你的时间，加上灯、背景布和道具',
        site: `每张 ${zhFromCredits}${plans}`,
      },
      { item: '能否免费试', photographer: '不能', diy: '已经有器材才行', site: zhFreeImages },
      {
        item: '一个商品拍三种风格',
        photographer: '拍摄时搭三套场景',
        diy: '搭三套场景，再修图',
        site: `一张手机照片，选三个模板，${zhSetCredits}起`,
      },
      {
        item: '多久拿到图',
        photographer: '拍完、修完之后',
        diy: '搭景、修图之后',
        site: '当场就能拿到',
      },
    ],
  }
}

// Same placeholder pair as the English pages until the real demo images ship (T8), with
// Chinese alt text and caption.
export function zhPlaceholderHero(caption: string): HeroBlock {
  const english = placeholderHero(caption)
  return {
    before: { ...english.before, alt: '手机拍的香煎三文鱼，陶瓷盘，餐厅灯光偏暗' },
    after: { ...english.after, alt: 'AI 改图后的同一盘香煎三文鱼，陶瓷盘，影棚布光' },
    caption,
    cta: { label: '上传一张照片', href: '/generate' },
  }
}
