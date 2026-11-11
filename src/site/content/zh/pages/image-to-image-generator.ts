import { baselineOffers, type OfferFacts } from '../../offer'
import { defineContentPage, type EditCases, type ShootDemo } from '@/core/content'

import { site } from '../../../site.config'
import { caseImage, SIZE_COUNT } from '../../landing-shared'
import { zhPricingRelated } from '../shared'
import { photoSeconds, SET_PHOTOS } from '../../offer'
import { productBills } from '../home'
import { zhFreeImages, zhTierList, zhTierPixels, zhUploadLimits } from '../offer'

// /zh/image-to-image-generator (T21). Keyword 「图生图」 with its family (ai图生图, 图生图ai,
// 以图生图, 图生图 在线) in the headings. People who search 图生图 are often after open-source
// models and tutorials (中文用户真实问法 C1), so the direct answer says first: no install, no
// prompts, the subject stays as shot. Layout and the facts / bills / links blocks: T44.
const brand = site.brand.name

// 本页的案例（public/cases，Owner 2026-11-11）：一张猫咪照片做成三种画风，再加四个精确改图。
// 图里的品牌都是虚构的。
const catPhone = caseImage('pet-phone', '示例手机照：一只白肚皮的虎斑猫趴在灰色沙发扶手上，晚上的台灯光，旁边有毯子和电视遥控器')
const catAnime = caseImage('pet-anime', 'AI 示例：同一只猫、同样的姿势和房间，画成粗线条、平涂阴影的日式动漫插画')

const catStyles: ShootDemo = {
  heading: { lead: '一张猫咪照片 → ', emphasis: '三种画风' },
  intro: '在沙发扶手上用手机随手拍了一张。做出三种画风，每张里都是同一只猫：虎斑花纹、鼻梁上的白条、绿眼睛和趴着的姿势都没变。',
  phone: { image: catPhone, file: 'IMG_0921.jpg', caption: '手机原图：晚上的台灯光，毯子和遥控器都入镜了。' },
  arrow: '三种画风，同一只猫',
  results: [
    { image: catAnime, title: '动漫风', template: '粗线条，平涂阴影' },
    { image: caseImage('pet-3d', 'AI 示例：同一只猫变成三维动画电影里的角色，趴在沙发上，暖色电影光'), title: '三维动画', template: '圆润造型，电影光' },
    { image: caseImage('pet-watercolor', 'AI 示例：同一只猫画成手绘水彩绘本插画，纸面纹理和柔和的晕染'), title: '水彩绘本', template: '纸面纹理，柔和晕染' },
  ],
}

const edits: EditCases = {
  heading: '改一处，其余不动',
  intro: '说清楚要改什么，就只动那一处。主体、版式和其他文字都保持原样。',
  labels: { before: '改前', after: '改后', reference: '参考图' },
  items: [
    {
      title: '房间照，变成挂牌用的样片',
      change: '收掉杂物，换成傍晚的金色光线。墙、窗、沙发和挂画的位置一点没变。',
      before: caseImage('room-phone', '示例手机照：傍晚的大平层客厅，布艺沙发、洞石茶几和整面城市落地窗，地上有购物袋、快递箱和扫地机器人'),
      after: caseImage('room-staged', 'AI 示例：同一个大平层客厅、同一个角度，杂物都收掉了，傍晚的金色光线，茶几上一瓶白色枝条'),
    },
    {
      title: '海报上改五处文字',
      change: '改了主题、一款饮品、它的价格、日期和优惠。手写字的风格、照片和其他文字都没动。',
      before: caseImage('poster-zh-before', 'AI 示例：森系风格的「小蕨咖啡」海报，手写大字「你好，秋天！」「抹茶和枫糖的季节」，下面是三款饮品的菜单和价格'),
      after: caseImage('poster-zh-after', 'AI 示例：同一张海报改了五处：抹茶和栗子的季节、栗子燕麦拿铁和它的新价格、每天都有、买二送一'),
    },
    {
      title: '换外壳颜色，一个字都不变',
      change: '酒红色的外壳和包装盒换成宝蓝色。品牌名、色号名、标语和口红膏体本身都保持原样。',
      before: caseImage('lipstick-before', 'AI 示例：一个虚构品牌的高端口红广告，酒红色多面切割外壳和包装盒放在洞石台上，配象牙色缎面，上方印着品牌名、色号和标语'),
      after: caseImage('lipstick-after', 'AI 示例：同一张口红广告，外壳和包装盒换成宝蓝色，广告上的文字一个都没变'),
    },
    {
      title: '把自家饮品换进成品图',
      change: '用一张手机随手拍的草莓抹茶拿铁，换掉原图里的黑糖珍珠奶茶。台面、背景、光线和角度不变，道具跟着换成草莓和抹茶粉。',
      before: caseImage('drink-before', 'AI 示例：黑糖珍珠奶茶的影棚广告图，水磨石台面，蜜桃色背景'),
      after: caseImage('drink-after', 'AI 示例：同样的影棚布景，黑糖珍珠奶茶换成了手机照里的草莓抹茶拿铁，旁边是草莓和抹茶粉'),
      reference: caseImage('drink-ref', '示例手机照：店里手拿着的一杯分层草莓抹茶拿铁，塑料杯'),
    },
  ],
}

const copy = {
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
    before: catPhone,
    after: catAnime,
    caption: '你的手机照片 → 动漫风：还是这只猫，变成了画',
    cta: { label: '上传照片', href: '/generate' },
  },
  facts: [
    { label: `一张照片：${zhUploadLimits}`, value: '手机拍的就行。不用抠图，不用白底，也不用先修图。' },
    { label: '选模板，不用描述', value: '光线、场景或画风都由模板决定。只有一行选填的「有什么想改的？」，写一句小要求就行。' },
    { label: `${zhTierList}，导出 PNG`, value: `长边分别是 ${zhTierPixels}，${SIZE_COUNT} 种尺寸，从方形主图到 9:16 竖版。每张 ${photoSeconds} 秒左右。` },
  ],
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
      link: { href: '/', anchor: '看看 AI改图 的全部模板。' },
    },
    {
      question: '图生图会把我的商品、菜品或房间改掉吗？',
      answer: '模板专门保留你拍的主体：形状、颜色、标签、摆盘或房间布局，只改光线、背景、场景或画风。',
    },
  ],
  headings: {
    facts: 'AI图生图：你只需要准备这些',
    faq: '以图生图常见问题',
    related: `${brand} 的其他页面`,
  },
  landing: {
    factsNote: `这些是 ${brand} 自己的上传限制和出图尺寸，本站每一页都一样。`,
    shoot: catStyles,
    edits,
  },
} as const

export const makeZhImageToImageGenerator = (offers: OfferFacts) => defineContentPage({
  ...copy,
  costBills: productBills(offers,`${SET_PHOTOS} 张商品图要花多少钱：请摄影师和用图生图对比`, `一个商品，${SET_PHOTOS} 张造型图，精修好、可以直接发。同样的活，两张账单。`),
  related: [
    { href: '/', anchor: 'AI改图', note: '全部模板，按餐饮、商品、美妆、房间、宠物和画风分类。' },
    { href: '/commercial-photography', anchor: '商业摄影', note: '网店和卖家不请摄影师，也能做出影棚级商品图。' },
    { href: '/ai-restaurant-menu', anchor: 'AI菜单配图', note: '餐厅用手机拍菜，直接做成菜单和外卖平台的图。' },
    zhPricingRelated(brand, offers),
  ],
})

export const zhImageToImageGenerator = makeZhImageToImageGenerator(baselineOffers)
