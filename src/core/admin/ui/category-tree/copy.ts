export const treeCopy = {
  move: '移动', moveTo: '移动到', root: '一级分类', cancel: '取消',
  expandAll: '全部展开', collapseAll: '全部收起',
  expand: (label: string, n: number) => `展开「${label}」，${n} 个子分类`,
  collapse: (label: string) => `收起「${label}」`,
  children: (n: number) => `${n} 个子分类`,
  position: (label: string, total: number) => `「${label}」的位置（1 到 ${total}），输入数字后按回车`,
  positionHint: '输入序号后按回车，移到同级第几位',
} as const
