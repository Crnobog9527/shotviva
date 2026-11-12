export const treeCopy = {
  move: '移动', moveTo: '移动到', root: '一级分类', cancel: '取消',
  inside: '移到此分类下', before: '放在此项前', append: '移到一级分类末尾',
  expandAll: '全部展开', collapseAll: '全部收起',
  expand: (label: string, n: number) => `展开「${label}」，${n} 个子分类`,
  collapse: (label: string) => `收起「${label}」`,
  children: (n: number) => `${n} 个子分类`,
} as const
