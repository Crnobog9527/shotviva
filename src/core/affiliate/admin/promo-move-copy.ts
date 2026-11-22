// Admin copy for the one-off move of old promotion grants (ARCHITECTURE §6.5 企业推广积分池). Chinese only.

const n = (value: number) => value.toLocaleString('zh-CN')

export const MOVE_COPY = {
  title: '迁移本月旧发放',
  hint: '改版前确认的发放单和临时追加进了主账号个人免费池。点下面的按钮，把本月还没用完的部分转进企业推广积分池（只转一次，有审计；以后的发放直接进企业池）。',
  nothing: '主账号里没有本月需要迁移的旧发放。',
  moved: (credits: number) => `本月已迁移 ${n(credits)}。`,
  amount: (credits: number) => `可迁移 ${n(credits)}`,
  submit: '转入企业推广积分池',
  confirmAsk: (org: string, credits: number) => `确认把 ${org} 主账号里本月未用完的 ${n(credits)} 推广积分转入企业推广积分池？`,
  answers: {
    applied: '已转入企业推广积分池。',
    nothing: '没有需要迁移的积分（可能已经迁移过）。',
    changed: '可迁移数已变化，请刷新页面核对后再点。',
    partnerOff: '这家企业已停用，不能迁移。',
    invalid: '提交的内容无效，请刷新后重试。',
  },
} as const

export type MovePreview = { period: string; credits: number; moved: number }
