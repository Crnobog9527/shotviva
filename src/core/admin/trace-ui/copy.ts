// 水印追查 (admin, Chinese only: DESIGN §7).
export const TRACE_COPY = {
  title: '水印追查',
  intro:
    '上传在外面发现的图片（截图、转存、裁剪过的都可以），系统读取免费作品里的隐形追踪水印，找出是哪张作品、谁的账号。图片只读一次，读完就删，不保存。',
  limits:
    '尽力而为：JPEG 重新保存、缩小到约 0.4 倍或放大到约 1.6 倍、裁掉一部分（留下 300 像素见方以上的完整区域）一般能读出；旋转、翻转、强模糊、AI 重绘、再缩成很小的截图读不出。读不出不代表不是本站作品。付费作品没有追踪水印。',
  pick: '选择图片',
  run: '开始读取',
  running: '读取中（最长约半分钟）…',
  notFound: '没有读出追踪水印。',
  found: '读出作品编号前缀',
  strength: '信号强度',
  agreement: '一致率',
  scale: '相对原图的缩放',
  noWork: '编号前缀对得上，但库里没有这张作品（可能已被彻底删除）。',
  columns: { job: '作品', owner: '账号', pool: '积分池', template: '模板', created: '生成时间', state: '状态' },
  pool: { free: '免费', paid: '付费' },
  deleted: '已删除',
  uploadFailed: '图片上传失败，请重试',
} as const
