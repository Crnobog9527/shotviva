// 「扣回这笔付款的剩余积分」 and the clawback columns (T71). Admin copy is Chinese only (DESIGN §7).
export const CLAWBACK_COPY = {
  column: '积分扣回',
  none: '—',
  clawedBack: (n: number) => `已扣回 ${n}`,
  shortfall: (n: number) => `欠扣 ${n} 积分`,
  shortfallHint: '这部分积分已被用掉，扣不回来；不做下次充值补扣，不封号。',
  button: '扣回剩余积分',
  loading: '读取中…',
  title: '扣回这笔付款的剩余积分',
  facts: (p: { granted: number; clawedBack: number; shortfall: number; balance: number }) =>
    `这笔付款发放了 ${p.granted} 积分，已扣回 ${p.clawedBack}${p.shortfall > 0 ? `，欠扣 ${p.shortfall}` : ''}。用户现在有 ${p.balance} 付费积分。`,
  will: (n: number) => `将扣回 ${n} 积分，记到这笔付款名下。之后按比例退款时，退款回调不会再扣这一部分。`,
  nothing: '现在没有可以扣回的积分（这笔已经扣完，或者用户的付费积分是 0）。',
  confirm: (n: number) => `确认扣回 ${n} 积分`,
  cancel: '取消',
  done: (n: number) => (n > 0 ? `已扣回 ${n} 积分` : '没有扣回积分（已经没有剩余）'),
} as const
