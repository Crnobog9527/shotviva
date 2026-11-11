import type { EditCases } from '@/core/content'

import { caseImage } from '../landing-shared'

// /zh 首页「AI 修改图片文字」（Owner 2026-11-11，shotviva-docs#7）：首页自己的四组案例，只改字。
// 每组的引号里是用户会写的那句话；店名和品牌都是虚构的。
export const zhTextEdits: EditCases = {
  heading: 'AI 修改图片文字：写一句话，字体不变',
  intro: '上传一张图，或打开在这里做好的作品，写一句话，比如「日期改成 11 月 22 日到 24 日」。只改你说的那几个字：字体和字号不变，不变形、不乱码，画面其他地方保持原样。',
  labels: { before: '改前', after: '改后', reference: '参考图' },
  items: [
    {
      title: '海报一次改四处',
      change: '「改成一周年店庆，7 折，11 月 22 日到 24 日，门牌 26 号。」四行字用海报原来的字体重写，照片和版式都没动。',
      before: caseImage('text-poster-zh-before', 'AI 示例：「青岚茶事」茶饮店海报，写着新店开业、全场饮品 8 折、11月15日—11月17日、梧桐路 18 号，下面是两杯水果冰茶'),
      after: caseImage('text-poster-zh-after', 'AI 示例：同一张海报改成一周年店庆、全场饮品 7 折、11月22日—11月24日、梧桐路 26 号，字体没变'),
    },
    {
      title: '包装标签换规格',
      change: '「改成淡香水，100 毫升。」瓶身标签和外盒一起改，还是原来的衬线字体，其他字母一个没动。',
      before: caseImage('text-perfume-before', 'AI 示例：一个虚构品牌的香水瓶和外盒放在洞石上，标签写着浓香水、50 毫升'),
      after: caseImage('text-perfume-after', 'AI 示例：同一瓶香水和外盒，标签和外盒都改成了淡香水、100 毫升'),
    },
    {
      title: '粉笔菜单改价格',
      change: '「拿铁改成 24，手冲改成 30，燕麦拿铁改名桂花燕麦拿铁。」新写的粉笔字和原来是同一个笔迹。',
      before: caseImage('text-chalk-zh-before', 'AI 示例：咖啡馆的手写粉笔菜单板，标题今日咖啡，下面四款咖啡和价格'),
      after: caseImage('text-chalk-zh-after', 'AI 示例：同一块菜单板，两个价格改了，燕麦拿铁改成桂花燕麦拿铁，还是同样的粉笔字'),
    },
    {
      title: '门头换店名',
      change: '「招牌改成小满面馆。」同样的毛笔字和灯光，街景还是原来拍的那条街。',
      before: caseImage('text-sign-zh-before', '示例手机照：夜里雨后街边的一家面馆，红色灯箱招牌写着阿婆面馆、手工面 · 老汤底'),
      after: caseImage('text-sign-zh-after', 'AI 示例：同一条街、同一家店，招牌改成了小满面馆，还是同样的毛笔字'),
    },
  ],
}
