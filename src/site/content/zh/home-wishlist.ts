import type { ImageRef, WishlistPromo } from '@/core/content'

// /zh home: 「没找到合适的模板？」 (Owner 2026-11-10), the same section as home-wishlist.ts:
// no timelines, no notification promises, examples said in alt text and the note only. Chinese
// has no italics, so the emphasis is set upright (marketing.css).
const ref = (file: string, width: number, height: number, alt: string): ImageRef => ({ src: `/home/${file}.webp`, alt, width, height })

export const zhHomeWishlist: WishlistPromo = {
  heading: { lead: '没找到合适的模板？', emphasis: '许个愿', tail: '，我们来做' },
  intro: '许愿墙是卖家提出想要的模板、一起投票决定先做哪个的地方。',
  points: [
    {
      heading: '你的品类还没有模板',
      text: '用一句话描述想要的效果，再配一张参考图，不用写提示词。',
    },
    {
      heading: '其他卖家一起投票',
      text: '大家都能给想要的愿望投票，票多的先做。',
    },
    {
      heading: '做好置顶，一键使用',
      text: '愿望做成模板后，会置顶在许愿墙上，点一下就能用。',
    },
  ],
  examples: [
    {
      image: ref('example-dish-before', 900, 1125, '一个愿望的参考图：后厨出菜口上的一盘菜（示意图）'),
      text: '周末早午餐菜单，做成暗调氛围海报',
      votes: 46,
      shipped: false,
    },
    {
      image: ref('hero-set-phone', 1080, 1350, '一个愿望的参考图：厨房台面上的一只编织皮托特包（示意图）'),
      text: '包包放在浅色石台上，带柔和投影',
      votes: 87,
      shipped: true,
    },
    {
      image: ref('example-skincare-before', 900, 1125, '一个愿望的参考图：浴室架子上的一罐护肤品（示意图）'),
      text: '护肤品放在湿沙滩上，海边自然光',
      votes: 31,
      shipped: false,
    },
  ],
  note: '许愿卡片均为示意。先出一张图，就能许愿和投票。',
  labels: { shipped: '已上线', votes: '票' },
  cta: { signedOut: '注册后去许愿', signedIn: '去许愿墙' },
}
