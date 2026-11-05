// Messages the admin sees when a save or switch is refused (DESIGN §7: Chinese only).
export const ANNOUNCEMENT_ERRORS = {
  input: '内容不完整：中英文都要填写，每条不超过 140 字。',
  link: '链接只能是站内路径（以 / 开头）或 https:// 地址。',
  window: '结束时间必须晚于开始时间。',
  overlap: '这条公告已启用，改完后的时间段和另一条已启用的公告重叠。先停用其中一条再保存。',
  notFound: '公告不存在，可能已被删除，请刷新页面。',
} as const
