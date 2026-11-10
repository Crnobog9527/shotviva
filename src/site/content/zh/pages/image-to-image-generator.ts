import { defineContentPage } from '@/core/content'

import { site } from '../../../site.config'
import { pairImage, SIZE_COUNT } from '../../landing-shared'
import { zhPricingRelated } from '../shared'
import { photoSeconds, SET_PHOTOS } from '../../offer'
import { productBills } from '../home'
import { zhFreeImages, zhTierList, zhTierPixels, zhUploadLimits } from '../offer'

// /zh/image-to-image-generator (T21). Keyword 「图生图」 with its family (ai图生图, 图生图ai,
// 以图生图, 图生图 在线) in the headings. People who search 图生图 are often after open-source
// models and tutorials (中文用户真实问法 C1), so the direct answer says first: no install, no
// prompts, the subject stays as shot. Layout and the facts / bills / links blocks: T44.
const brand = site.brand.name

export const zhImageToImageGenerator = defineContentPage({
  slug: 'image-to-image-generator',
  keyword: '图生图',
  label: '图生图',
  module: 'image',
  title: `图生图在线工具：上传照片选模板，不写提示词（2026） | ${site.brand.name}`,
  description: `图生图在线工具：不用装软件、不用写提示词，上传一张照片选个模板就出图，主体保持原样。新用户送 ${zhFreeImages}。`,
  h1: '图生图：上传一张照片，选个模板就出图',
  subtitle: '从你自己的照片出发，而不是一个空白的输入框。主体保持原样。',
  answerBlock: `图生图就是用你上传的照片生成一张新图。${brand} 的图生图在线工具用模板出图：不用装软件，也不用写提示词，选一个餐饮、商品、美妆、房间、宠物或画风模板，光线、场景或画风就由模板定好。主体保持原样，新用户送 ${zhFreeImages}。`,
  hero: {
    before: pairImage('example-skincare-before', '手机随手拍：浴室架子上的一罐护肤品，室内平光（示意图）'),
    after: pairImage('example-skincare-after', '同一罐护肤品放在石台上，柔和的水疗光，水疗展台模板（示意图）'),
    caption: '你的手机照片 → 水疗展台模板：还是这罐护肤品，换了布景和光线 · 示意图',
    cta: { label: '上传照片', href: '/generate' },
  },
  facts: [
    { label: `一张照片：${zhUploadLimits}`, value: '手机拍的就行。不用抠图，不用白底，也不用先修图。' },
    { label: '选模板，不用描述', value: '光线、场景或画风都由模板决定。只有一行选填的「有什么想改的？」，写一句小要求就行。' },
    { label: `${zhTierList}，导出 PNG`, value: `长边分别是 ${zhTierPixels}，${SIZE_COUNT} 种尺寸，从方形主图到 9:16 竖版。每张 ${photoSeconds} 秒左右。` },
  ],
  costBills: productBills(`${SET_PHOTOS} 张商品图要花多少钱：请摄影师和用图生图对比`, `一个商品，${SET_PHOTOS} 张造型图，精修好、可以直接发。同样的活，两张账单。`),
  faq: [
    {
      question: '图生图有免费的吗？',
      answer: `新用户送 ${zhFreeImages}。`,
    },
    {
      question: '以图生图用哪个 AI 工具好？',
      answer: `看你要什么。想自己调模型、写提示词，可以用开源模型和工作流；想上传一张照片直接出能用的图，${brand} 用现成的模板，不用写提示词，主体保持原样。`,
    },
    {
      question: '有没有在线图生图网站，不用装软件？',
      answer: `${brand} 就是网页版，手机和电脑浏览器都能直接用。支持 ${zhUploadLimits}，出图尺寸为${zhTierPixels}。`,
    },
    {
      question: '图生图需要写提示词吗？',
      answer: '不需要。选模板就行，剩下的交给我们。个别模板会让你填一行字，比如海报上的标题和价格。',
    },
    {
      question: '图生图会把我的商品、菜品或房间改掉吗？',
      answer: '模板专门保留你拍的主体：形状、颜色、标签、摆盘或房间布局，只改光线、背景、场景或画风。',
    },
  ],
  related: [
    { href: '/', anchor: 'AI改图', note: '全部模板，按餐饮、商品、美妆、房间、宠物和画风分类。' },
    { href: '/commercial-photography', anchor: '商业产品摄影', note: '网店和卖家不请摄影师，也能做出影棚级商品图。' },
    { href: '/ai-restaurant-menu', anchor: 'AI菜单配图', note: '餐厅用手机拍菜，直接做成菜单和外卖平台的图。' },
    zhPricingRelated(brand),
  ],
  headings: {
    facts: 'AI图生图：你只需要准备这些',
    faq: '以图生图常见问题',
    related: `${brand} 的其他页面`,
  },
  landing: {
    factsNote: `这些是 ${brand} 自己的上传限制和出图尺寸，本站每一页都一样。`,
  },
})
