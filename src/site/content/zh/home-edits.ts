import type { EditCases } from '@/core/content'

import { caseImage } from '../landing-shared'

// /zh 首页「AI 修改图片文字」（Owner 2026-11-11，shotviva-docs#7）：首页自己的两组案例（11-24 起去掉了粉笔菜单和门头，手机页更短），只改字。
// 每组的引号里是用户会写的那句话；店名和品牌都是虚构的。
export const zhTextEdits: EditCases = {
  heading: 'AI 修改图片文字：写一句话，字体不变',
  intro: '上传一张图片，或打开你在 Shotviva 生成的作品，用一句话说明要改的内容，例如「日期改成 11 月 22 日到 24 日」。只修改指定的文字，字体、字号保持不变，不会出现变形或乱码，画面其余部分不受影响。',
  labels: { before: '改前', after: '改后', reference: '参考图' },
  items: [
    {
      title: '海报一次改四处',
      change: '「改成一周年店庆，7 折，11 月 22 日到 24 日，门牌 26 号。」四行字用海报原来的字体重写，照片和版式都没动。',
      before: caseImage('text-poster-zh-before', '真实案例：「青岚茶事」茶饮店海报，写着新店开业、全场饮品 8 折、11 月 15 日—11 月 17 日、梧桐路 18 号，下面是两杯水果冰茶'),
      after: caseImage('text-poster-zh-after', '真实案例：同一张海报改成一周年店庆、全场饮品 7 折、11 月 22 日—11 月 24 日、梧桐路 26 号，字体没变'),
    },
    {
      title: '包装标签换规格',
      change: '「改成淡香水，100 毫升。」瓶身标签和外盒一起改，还是原来的衬线字体，其他字母一个没动。',
      before: caseImage('text-perfume-before', '真实案例：一个虚构品牌的香水瓶和外盒放在洞石上，标签写着浓香水、50 毫升'),
      after: caseImage('text-perfume-after', '真实案例：同一瓶香水和外盒，标签和外盒都改成了淡香水、100 毫升'),
    },
  ],
}
