// Admin copy for the fee go-live card. Admin screens are Chinese only.
export const START_COPY = {
  title: '开始记录手续费',
  recordFrom: '起算时间（北京时间）',
  terms: '当前联盟条款版本',
  notStarted: '还没开始：所有付款仍按旧规则计佣',
  button: '开始记录手续费',
  explain: (version: string) =>
    `点下面的按钮后，从这一刻起的新付款会记录手续费，佣金改按扣除手续费后的金额计算；联盟条款同时切到 ${version} 版，推广员下次登录要重新同意。之前的付款仍按旧规则，不受影响。`,
  confirm: (version: string) => `我确认现在开始记录手续费，并把联盟条款切到 ${version} 版。这一步不能撤销，也不能改成更早的时间。`,
  startedHint: '已经开始记录手续费。这一步是单向的：后台不能撤销，也不能把起算时间改早或改晚。',
  answers: {
    feesStarted: '已开始记录手续费，条款已切换。',
    feesAlreadyStarted: '已经开始过了（同一版条款），没有改动。',
    feesStartedOther: '已经开始过了，起算时间和条款不能再改。',
    feesStartChanged: '这一页的信息已过期（起算时间或条款版本刚被改过），请刷新后再看。',
    feesConfirmMissing: '请先勾选确认。',
  } as Record<string, string>,
} as const
