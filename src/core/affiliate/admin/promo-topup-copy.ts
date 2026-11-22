// Admin copy for ad-hoc top-ups of promotion credits (ARCHITECTURE §6.5 渠道商推广积分「临时追加」).
// Chinese only, like the rest of the tab.

/** The most one top-up may add (migration 1845 checks the same bound). */
export const PROMO_TOPUP_MAX = 100_000

const n = (value: number) => value.toLocaleString('zh-CN')

export const TOPUP_COPY = {
  title: '临时追加',
  intro: `随时给渠道商追加本月的推广积分（例如第一个月还没有业绩、保底不够用）。和每月发放单一样进企业的推广积分池（不进主账号个人余额），本月底（UTC）连同员工手里没用完的一起清零；不影响每月发放单的保底、业绩和扣回。每次最多 ${n(PROMO_TOPUP_MAX)}，原因必填。`,
  noPartners: '还没有渠道商。先在下面的「渠道商」表里把企业设为渠道商。',
  sheet: '本月发放单',
  sheetNone: '还没有生成',
  sheetNotGranted: (status: string) => `${status}（未发放，不计入合计）`,
  topups: '本月临时追加',
  noTopups: '本月还没有临时追加。',
  monthTotal: '本月合计',
  monthTotalHint: '已发放的发放单 + 临时追加，都在企业推广积分池；本月底一起清零。',
  amount: '追加积分',
  reason: '原因（必填）',
  submit: '临时追加',
  confirmAsk: (org: string, credits: number) => `确认给 ${org} 的推广积分池追加 ${n(credits)}？本月底清零。`,
  when: '时间',
  who: '操作人',
  expires: '到期',
  expired: (credits: number) => `已清零 ${n(credits)}`,
  sheetTopups: '临时追加',
  sheetMonthTotal: '本月合计（含临时追加）',
  answers: {
    granted: '已追加。',
    already: '这次追加已经提交过了，没有重复发放。',
    changed: '企业主账号或月份已变化，请刷新页面后重新填写。',
    partnerOff: '这家企业已不是渠道商（或已停用），不能追加。',
    tooMany: `每次最多追加 ${n(PROMO_TOPUP_MAX)}。`,
    reasonMissing: '请填写追加原因。',
    invalid: '提交的内容无效，请刷新后重试。',
  },
} as const
