import type { ImageRef, WishlistPromo } from '@/core/content'

// /zh home: 「没找到合适的模板？」 (Owner 2026-11-10), the same section as home-wishlist.ts:
// no timelines, no notification promises, examples said in alt text and the note only. The
// pictures are the wished-for look, not the uploaded reference photo. Chinese
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
      image: ref('wish-brunch-dark', 1080, 1080, '想要的效果（示意）：暗调的周末早午餐菜单海报'),
      text: '想要一个周末早午餐的海报模板，暗调那种，菜单和价格能直接排上去',
      votes: 46,
      shipped: false,
    },
    {
      image: ref('wish-cafe-light', 1080, 1080, '想要的效果（示意）：明亮原木风咖啡馆的开业海报'),
      text: '我们咖啡馆下个月开业，想要个开业海报模板，店里拍的照片放进去就能用',
      votes: 64,
      shipped: false,
    },
    {
      image: ref('wish-tea-dark', 1080, 1080, '想要的效果（示意）：暗调的奶茶新品海报'),
      text: '奶茶店要上新品，想要那种暗调、看着高级一点的新品海报',
      votes: 38,
      shipped: false,
    },
    {
      image: ref('wish-bag-stone', 1080, 1080, '想要的效果（示意）：皮包放在浅色石台上，带柔和投影'),
      text: '我是卖包的，想要包包放在浅色石台上那种感觉，带点柔和的影子，看着高级',
      votes: 87,
      shipped: true,
    },
    {
      image: ref('wish-lunch-light', 1080, 1080, '想要的效果（示意）：明亮清爽的午市菜单海报'),
      text: '想要一个工作日午市套餐的海报，清爽明亮一点，菜单能排上去',
      votes: 41,
      shipped: false,
    },
    {
      image: ref('wish-cafe-evening', 1080, 1080, '想要的效果（示意）：黄昏街边开满鲜花的咖啡馆海报'),
      text: '想给咖啡馆做个傍晚的引流海报，要街边、鲜花、天快黑那种氛围',
      votes: 57,
      shipped: false,
    },
    {
      image: ref('wish-tea-light', 1080, 1080, '想要的效果（示意）：清爽的奶茶第二杯半价促销海报'),
      text: '我们每周三第二杯半价，想要一个清爽好看的促销海报，每周能直接套',
      votes: 52,
      shipped: false,
    },
    {
      image: ref('wish-skincare-stone', 1080, 1080, '想要的效果（示意）：护肤品放在暖色岩石上，带阳光树影'),
      text: '求一个护肤品模板！想要放在暖色石头上，有阳光和树影的那种氛围',
      votes: 31,
      shipped: false,
    },
  ],
  note: '许愿卡片均为示意。先出一张图，就能许愿和投票。',
  labels: { shipped: '已上线', votes: '票' },
  cta: { signedOut: '注册后去许愿', signedIn: '去许愿墙' },
}
