// Admin is Chinese-only (DESIGN §7); the drag-to-reorder text lives here, not in messages.
const at = (index: number, total: number) => `第 ${index + 1} 位，共 ${total} 个`

export const sortableCopy = {
  handle: (label: string) => `拖动排序：${label}`,
  roleDescription: '可拖动排序',
  instructions: '按空格键拿起，用上下方向键移动，再按空格键放下，按 Esc 取消。触屏上长按这一行约半秒后拖动。',
  moveUp: (label: string) => `上移 ${label}`,
  moveDown: (label: string) => `下移 ${label}`,
  picked: (label: string, index: number, total: number) => `已拿起「${label}」，现在${at(index, total)}。`,
  moved: (label: string, index: number, total: number) => `「${label}」移到${at(index, total)}。`,
  dropped: (label: string, index: number, total: number) => `「${label}」放在${at(index, total)}，正在保存。`,
  unchanged: (label: string) => `「${label}」已放下，顺序没变。`,
  cancelled: (label: string, index: number, total: number) => `已取消，「${label}」回到${at(index, total)}。`,
} as const
