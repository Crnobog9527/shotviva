import type { EditCases } from '@/core/content'

import { space } from '../home-spaces'

// /zh 首页的酒店民宿区块（Owner 2026-11-24）：四组真实案例，图和英文页相同，
// 来自已上架的「建筑空间」酒店模板封面。
export const zhHomeSpaces: EditCases = {
  heading: '酒店和民宿：客房、大堂、泳池，手机拍的也能用',
  intro:
    '晚上拍的客房发暗、傍晚的泳池灰蒙蒙、大堂只有顶灯：上传手机照，选一个酒店模板。房间布局、家具和窗外景色都留在原位，只把光线和氛围调成订房网站和官网要的样子。',
  labels: { before: '真实手机照', after: 'AI', reference: '参考图' },
  items: [
    {
      title: '客房夜景',
      change: '「酒店客房夜景」模板：床、床尾凳和窗户都在原位，灯光变得温暖均匀。',
      before: space('hotel-room-photo', '真实手机照：夜里的酒店客房，光线发暗，床、床尾凳和黑着的窗户'),
      after: space('hotel-room-ai', '真实案例：同一间客房，灯光温暖均匀，床品平整，窗外能看到雪山'),
    },
    {
      title: '室内泳池',
      change: '「酒店室内泳池夜景」模板：还是这个泳池厅，水变清透，石墙被照亮。',
      before: space('hotel-pool-photo', '真实手机照：夜里的酒店室内泳池，大厅昏暗，水面发黑'),
      after: space('hotel-pool-ai', '真实案例：同一个室内泳池，池水清透发蓝，石墙被灯光照亮'),
    },
    {
      title: '傍晚的泳池露台',
      change: '「酒店室外空间夜景」模板：露台和躺椅不动，天色换成温暖的日落。',
      before: space('hotel-outdoor-photo', '真实手机照：海边酒店的泳池露台，傍晚天色发灰'),
      after: space('hotel-outdoor-ai', '真实案例：同一个泳池露台和躺椅，海面上是温暖的日落'),
    },
    {
      title: '大堂夜景',
      change: '「酒店大堂夜景」模板：大堂和前台不动，光线更暖更亮。',
      before: space('hotel-lobby-photo', '真实手机照：木质吊顶的酒店大堂，夜里光线发平'),
      after: space('hotel-lobby-ai', '真实案例：同一个大堂和前台，光线更暖更亮'),
    },
  ],
}
