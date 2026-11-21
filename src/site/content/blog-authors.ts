import type { BlogAuthor } from '@/core/blog/authors'

// Shotviva's blog authors (core/blog/authors.ts). A post whose 作者名 is exactly one of these
// names links to that author's page. Facts and portrait from the Owner (2026-11-21); keep
// them to what the Owner has confirmed.

export const BLOG_AUTHORS: readonly BlogAuthor[] = [
  {
    slug: 'simon-lee',
    name: 'Simon Lee',
    photo: { src: '/blog/authors/simon-lee.webp', width: 480, height: 600 },
    knowsAbout: ['Commercial photography', 'TV commercial directing', 'Film directing', 'Lighting', 'AI image editing'],
    text: {
      en: {
        jobTitle: 'Founder of Shotviva, TVC and film director',
        intro: 'Simon Lee is the founder of Shotviva and a TVC and film director. He has worked in commercial photography and film since 2017.',
        roles: [
          'Guest lecturer at the Communication University of China',
          'Guest lecturer for Canon, Nikon and SIRUI',
          'Guest technical consultant for Aputure',
        ],
        awards: [
          '2021: Winner, Hollyland “Voice of the City” global short film contest',
          '2021: Nikon New Imaging Award, Zhiyun global short film contest',
          '2021: Creative cultural-tourism short film recommended by the jury of the first Golden Bull Film Exhibition',
          '2022: Nominated for Best Entertainment Short, short video section of the 12th Beijing International Film Festival',
        ],
        brands: ['Ant Group', 'Changhong', 'Meiling', 'Mijia', '361°', 'Wahaha', 'Lexus', 'IHG Hotels & Resorts', 'Sunac Xishuangbanna resort'],
      },
      zh: {
        jobTitle: 'Shotviva 创始人，TVC 广告与故事片导演',
        intro: 'Simon Lee，Shotviva 创始人，TVC 广告与故事片导演，2017 年入行做摄影。',
        roles: ['中国传媒大学特邀讲师', '佳能、尼康、思锐光学官方特邀讲师', '爱图仕特邀技术顾问'],
        awards: [
          '2021 猛玛“城市之声”全球短片大赛冠军',
          '2021 智云全球短片大赛尼康新影像奖',
          '2021 首届电影金牛展评委会推荐创意文旅短片获得者',
          '2022 第十二届北京国际电影节短视频单元最佳娱乐类短片提名',
        ],
        brands: ['蚂蚁金服', '长虹集团', '美菱', '米家', '361°', '娃哈哈', '雷克萨斯', '洲际酒店集团', '融创·西双版纳度假区'],
      },
    },
  },
]
