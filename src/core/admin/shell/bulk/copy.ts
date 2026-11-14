// Copy for the row ticks and the selection bar shared by admin lists (DESIGN §7: Chinese only).
export const BULK_COPY = {
  selected: (n: number) => `已选 ${n} 个`,
  clear: '取消选择',
  selectAll: '选择本页全部',
  cancel: '取消',
  back: '返回修改',
  finish: '完成',
  working: '处理中…',
  done: (n: number) => `已完成 ${n} 个`,
  skipped: (n: number) => `跳过 ${n} 个：`,
  nothingDone: '一个都没有改。',
  more: (n: number) => `还有 ${n} 个`,
  failed: '操作失败，请稍后重试',
} as const
