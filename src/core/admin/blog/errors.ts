// Messages the admin sees when a save or switch is refused (DESIGN §7: Chinese only).
export const BLOG_ERRORS = {
  input: '内容不完整或格式不对：标题、简介、作者必填；网址只能用小写字母、数字和连字符；配图要有替代文字。',
  slugTaken: '这个语言下已经有同样网址的文章，换一个网址。',
  notFound: '文章不存在，可能已被删除，请刷新页面。',
  empty: '正文是空的，写点内容再发布。',
  localeLocked: '已发布的文章不能改语言：先撤回为草稿，改完再发布。',
  cover: '封面文件不对：只收 JPEG、PNG 或 WebP，不超过 20MB。',
} as const
