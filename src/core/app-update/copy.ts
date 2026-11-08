import type { UpdateCopy } from './update-bar'

// The banner on admin pages (DESIGN §7: the admin is Chinese only, its copy in copy.ts). Same
// words as the zh site (site/messages/zh.json appUpdate).
export const ADMIN_COPY: UpdateCopy = {
  label: '新版本提示',
  body: 'Shotviva 已更新，刷新后继续使用',
  refresh: '刷新',
  close: '关闭',
  photosLost: '刷新后需要重新上传照片',
}
