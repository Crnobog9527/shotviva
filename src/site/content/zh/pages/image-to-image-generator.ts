import { defineContentPage } from '@/core/content'

import { site } from '../../../site.config'
import { zhFreeImages, zhFromCredits, zhPlansSentence, zhTierPixels, zhUploadLimits } from '../offer'
import { zhPlaceholderHero, zhSharedCostTable, zhSharedFacts } from '../shared'

// /zh/image-to-image-generator (T21). Keyword 「图生图」 with its family (ai图生图, 图生图ai,
// 以图生图, 图生图 在线) in the headings. People who search 图生图 are often after open-source
// models and tutorials (中文用户真实问法 C1), so the direct answer says first: no install, no
// prompts, the subject stays as shot.
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
  hero: zhPlaceholderHero('图生图保留了菜品和盘子，只换了场景。'),
  facts: zhSharedFacts(),
  costTable: zhSharedCostTable(),
  faq: [
    {
      question: '图生图有免费的吗？',
      answer: `有。新用户送 ${zhFreeImages}，之后每张${zhFromCredits}。${zhPlansSentence()}`,
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
    { href: '/pricing', anchor: `${brand} 价格`, note: '月付、年付套餐和一次性积分包。' },
  ],
  headings: {
    facts: 'AI图生图：参数和事实',
    costTable: '图生图在线出图和请摄影师的对比',
    faq: '以图生图常见问题',
  },
})
