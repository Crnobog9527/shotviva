import { TEMPLATE_REQUESTS_PATH, type TemplateRequestsText } from '@/core/content/template-requests'

import { site } from '../../site.config'
import { zhHomeWishlist } from './home-wishlist'

const brand = site.brand.name

// /zh/template-requests (Owner 2026-11-25 SEO plan). 「许愿墙」只作页面里的栏目名，不进标题和 H1。
// 回答都按许愿墙的实际做法写（ARCHITECTURE §15），和英文版一一对应。
export const zhTemplateRequestsPage: TemplateRequestsText = {
  path: TEMPLATE_REQUESTS_PATH,
  label: '模板许愿墙',
  title: `找不到合适的模板？提交需求，大家投票，我们来做 | ${brand}`,
  description: '找不到适合你照片的 AI 修图模板？写下你拍了什么、想要什么效果，其他用户一起投票，票数最多的需求由我们做成模板，上线到 Shotviva。',
  h1: '找不到合适的 AI 修图模板？告诉我们你要什么',
  intro: `说清楚你拍了什么、需要什么样的图。其他 ${brand} 用户会投票，票数最多的需求会做成人人可用的模板。`,
  cta: { submit: '提交模板需求', vote: '去许愿墙投票' },
  closed: '模板需求暂时停止提交，下面的模板照常可用。',
  steps: {
    heading: '模板需求怎么提交',
    items: [
      { heading: '写下照片和想要的效果', text: '用平常的话写清楚拍的是什么、想要什么样的图，再附 1～3 张参考图。不用写提示词。' },
      { heading: '其他用户投票', text: '需求通过审核后上许愿墙，其他用户给自己也想要的需求投票。' },
      { heading: '票数最多的先做', text: '我们按票数从高到低制作。模板上线后，你和所有投过票的用户都会在 Shotviva 收到提醒。' },
    ],
  },
  examples: {
    heading: '需求示例',
    intro: '下面都是示例。真实的需求和票数，登录后在许愿墙里查看。',
    wall: zhHomeWishlist,
  },
  shipped: {
    heading: '由需求做成的模板',
    intro: '这些模板最早来自许愿墙上的需求。',
    open: '打开模板',
  },
  good: {
    heading: '怎样写需求更容易被做出来',
    intro: '定制 AI 修图模板时，我们最需要知道三件事。',
    points: [
      { heading: '你的照片', text: '拍的是什么、怎么拍的：桌上的一道菜、书桌上的商品、从门口拍的酒店客房。' },
      { heading: '想要的效果', text: '光线、背景、氛围或画风。一张参考图往往比一段文字说得更清楚。' },
      { heading: '用在哪里', text: '外卖平台、菜单、商品详情页、订房网站还是社交媒体，方便我们定好尺寸和构图。' },
    ],
    examplesHeading: '示例',
    examples: [
      '餐饮模板：我们的汤面俯拍在深色石桌上，暖色侧光，用于外卖平台主图。',
      '商品模板：浴室置物架上的香薰蜡烛，清晨柔光，正方形，用于网店详情页。',
      '酒店模板：晚上拍的双床房，想要明亮通透的效果，用于订房网站。',
    ],
  },
  today: {
    heading: '现在就能用的模板',
    links: [
      { href: '/ai-restaurant-menu', anchor: '餐饮模板', note: '用手机照片做菜单、外卖平台和海报用图' },
      { href: '/commercial-photography', anchor: '商品模板', note: '白底主图、场景图和促销海报' },
      { href: '/#templates', anchor: '酒店和空间模板', note: '客房、大堂和餐厅空间，与餐饮模板在一起' },
    ],
  },
  faqHeading: '关于模板需求的常见问题',
  faq: [
    {
      question: '提交的需求多久能做成模板？',
      answer: '没有固定时间。每条新需求先经过审核才会上许愿墙，之后按票数从高到低制作。你提交或投过票的模板上线后，下次打开 Shotviva 时会收到提醒。',
    },
    {
      question: '提交需求和投票要花积分吗？',
      answer: `不用。提交需求和投票都免费。你需要一个至少成功出过 1 张图的 ${brand} 账号，每个账号每天最多提交 5 条需求。模板上线后使用，和其他模板一样计费。`,
    },
    {
      question: '我的照片会公开吗？',
      answer: '不会。你的需求、参考图和用户名只在许愿墙里给已登录用户看，不会出现在本页，上面的需求都是示例。参考图会重新保存并去掉位置信息，用户名只显示首字加三个星号；需求被拒、下架或账号注销时，参考图会被删除。',
    },
    {
      question: '做出来的模板会改变照片里的主体吗？',
      answer: `由需求做成的模板和其他 ${brand} 模板一样：改变光线、背景、场景或画风，主体保持你拍的样子，商品和标签、菜品、房间布局都不变。`,
    },
    {
      question: '可以提餐厅或酒店照片的 AI 模板需求吗？',
      answer: '可以。菜品、饮品、菜单、酒店客房和餐厅空间都可以提。写清楚是哪道菜或哪个房间，以及图片用在哪里。',
    },
  ],
}
