import type { BlogAuthor } from '@/core/blog/authors'

// Shotviva's blog authors (core/blog/authors.ts). A post whose 作者名 is exactly one of these
// names links to that author's page. Facts and portrait from the Owner (2026-11-21, bio and
// lecturer titles 2026-11-22); keep them to what the Owner has confirmed.

export const BLOG_AUTHORS: readonly BlogAuthor[] = [
  {
    slug: 'simon-lee',
    name: 'Simon Lee',
    photo: { src: '/blog/authors/simon-lee.webp', width: 480, height: 600 },
    knowsAbout: ['Commercial photography', 'TV commercial directing', 'Film directing', 'Lighting', 'AI image editing'],
    text: {
      en: {
        jobTitle: 'Founder of Shotviva · TVC and film director',
        intro: 'Simon Lee, founder of Shotviva: TVC and film director since 2017, award-winning short filmmaker, Canon certified lecturer; shot for IHG, Lexus, Ant Group.',
        bio: 'Simon Lee has worked in commercial photography and TV commercials since 2017. His short films have won awards at international contests, including first prize in Hollyland’s global “Voice of the City” short film contest and Nikon’s New Imaging Award, and were nominated at the 12th Beijing International Film Festival. He is a Canon certified lecturer and a guest lecturer for Nikon, and has shot for IHG Hotels & Resorts, Lexus and Ant Group.',
        roles: [
          'Canon certified lecturer',
          'Guest lecturer for Nikon and SIRUI',
          'Guest lecturer at the Communication University of China',
          'Guest technical consultant for Aputure',
        ],
        awards: [
          '2021: First prize, Hollyland “Voice of the City” global short film contest',
          '2021: Nikon New Imaging Award, Zhiyun global short film contest',
          '2021: Creative cultural-tourism short film recommended by the jury of the first Golden Bull Film Exhibition',
          '2022: Nominated for Best Entertainment Short, short video section of the 12th Beijing International Film Festival',
        ],
        brands: ['IHG Hotels & Resorts', 'Lexus', 'Ant Group', 'Changhong', 'Meiling', 'Mijia', '361°', 'Wahaha', 'Sunac Xishuangbanna resort'],
      },
      zh: {
        jobTitle: 'Shotviva 创始人 · TVC 广告与故事片导演',
        intro: 'Simon Lee，Shotviva 创始人，TVC 广告与故事片导演，2017 年入行。短片获国际短片大赛奖项，佳能官方认证讲师，合作过洲际酒店集团、雷克萨斯、蚂蚁金服。',
        bio: 'Simon Lee 2017 年入行，从事商业摄影和 TVC 广告。他的短片获猛玛“城市之声”全球短片大赛冠军、智云全球短片大赛尼康新影像奖，并入围第十二届北京国际电影节。他是佳能官方认证讲师、尼康特邀讲师，合作过洲际酒店集团、雷克萨斯、蚂蚁金服等品牌。',
        roles: ['佳能官方认证讲师', '尼康、思锐光学官方特邀讲师', '中国传媒大学特邀讲师', '爱图仕特邀技术顾问'],
        awards: [
          '2021 猛玛“城市之声”全球短片大赛冠军',
          '2021 智云全球短片大赛尼康新影像奖',
          '2021 首届电影金牛展评委会推荐创意文旅短片获得者',
          '2022 第十二届北京国际电影节短视频单元最佳娱乐类短片提名',
        ],
        brands: ['洲际酒店集团', '雷克萨斯', '蚂蚁金服', '长虹集团', '美菱', '米家', '361°', '娃哈哈', '融创·西双版纳度假区'],
      },
    },
  },
]
