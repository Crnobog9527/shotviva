import type { SpaceCases } from '@/core/content'

import { HOTEL_TEMPLATES, space } from '../home-spaces'

// /zh 首页的酒店民宿区块（Owner 2026-11-24）：四组真实案例，图和英文页相同，来自已上架的
// 「建筑空间」酒店模板封面（2026-11-25 换成 Owner 指定的四个：客房、餐厅、室外空间、大堂）。
export const zhHomeSpaces: SpaceCases = {
  heading: '酒店和民宿：客房、大堂、泳池，手机拍的也能用',
  intro:
    '手机拍的客房、餐厅、泳池和大堂，常常光线发灰、颜色发闷：上传手机照，选一个酒店模板。房间布局、家具和窗外景色都留在原位，只把光线和质感调成订房网站和官网要的样子。',
  labels: { before: '真实手机照', after: 'AI', reference: '参考图' },
  viewer: { open: '查看「{title}」大图', close: '关闭', previous: '上一组', next: '下一组', counter: '第 {n} 组，共 {total} 组' },
  items: [
    {
      title: '客房',
      template: HOTEL_TEMPLATES.room,
      change: '「酒店客房渲染」模板：床、床尾凳和窗户都在原位，房间更明亮，窗外雪山更清楚。',
      before: space('hotel-room-day-photo', '真实手机照：白天的酒店客房，光线发灰，床、床尾凳和窗外的雪山'),
      after: space('hotel-room-day-ai', '真实案例：同一间客房，光线明亮柔和，床品平整，窗外雪山清晰'),
    },
    {
      title: '餐厅',
      template: HOTEL_TEMPLATES.restaurant,
      change: '「酒店餐厅渲染」模板：桌椅和吊灯都在原位，餐厅更亮堂，窗外是晚霞映着的雪山。',
      before: space('hotel-restaurant-photo', '真实手机照：木梁吊顶的酒店餐厅，光线偏暗，窗外是雪山'),
      after: space('hotel-restaurant-ai', '真实案例：同一个餐厅，灯光温暖，窗外雪山映着晚霞'),
    },
    {
      title: '泳池露台',
      template: HOTEL_TEMPLATES.outdoor,
      change: '「酒店室外空间」模板：泳池、躺椅和遮阳伞都不动，海上的日落更通透。',
      before: space('hotel-terrace-photo', '真实手机照：海边酒店的泳池露台，傍晚天色发灰'),
      after: space('hotel-terrace-ai', '真实案例：同一个泳池露台，池水清透，海面上是温暖的日落'),
    },
    {
      title: '大堂',
      template: HOTEL_TEMPLATES.lobby,
      change: '「酒店大堂渲染」模板：大堂、沙发和前台都在原位，石材地面更干净，光线更通透。',
      before: space('hotel-lobby-day-photo', '真实手机照：挑高的酒店大堂，水晶吊灯，窗外是城市楼群'),
      after: space('hotel-lobby-day-ai', '真实案例：同一个大堂，地面光洁，光线明亮通透'),
    },
  ],
}
