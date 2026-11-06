import type { ReplayOutcome } from '@/core/billing/stripe'

// Stripe replay copy (T26; DESIGN §7: Chinese only, kept out of site/messages).
export const REPLAY_COPY = {
  title: '按 Stripe id 重放入账',
  body: '用户付了款却没到账时（回调没送到），输入 Checkout Session id（cs_…）或订阅 id（sub_…）。先预览，确认后才写入；和回调走同一个入账函数，谁先到都只入账一次。',
  label: 'Stripe id',
  placeholder: 'cs_… 或 sub_…',
  preview: '预览',
  confirm: '确认入账',
  confirmSync: '确认同步订阅',
  cancel: '取消',
  yes: '是',
  no: '否',
  checkout: {
    user: '用户',
    product: '商品',
    credits: (n: number) => `${n} 个付费积分`,
    amount: '实付',
    settled: '这笔已经入账过，重放不会再加积分。',
    pending: '还没有入账，确认后会加积分、写付款记录。',
  },
  subscription: {
    status: '状态',
    periodEnd: '本期结束',
    cancel: '到期取消',
    mirrored: '镜像行已存在，确认后会更新为 Stripe 上的当前状态，不动积分和会员期。',
    missing: '还没有镜像行：首付还没入账。先重放这个订阅首付的 cs_…。',
  },
  outcome: {
    applied: '已入账。',
    replayed: '这笔之前已经入账，没有重复发放。',
    unpaid: '这笔还没付款，没有入账。',
    synced: '订阅镜像已同步。',
    unknown: '没有找到镜像行，什么都没改。',
  } satisfies Record<ReplayOutcome, string>,
  auditReason: (outcome: ReplayOutcome) => `后台重放：${outcome}`,
  errors: {
    format: '请输入 cs_… 或 sub_… 开头的 Stripe id。',
    unpaid: '这个 session 还没有付款完成（payment_status 不是 paid），不能重放。',
    mismatch: 'Stripe 上的 metadata 或价格和我们的商品对不上，已拒绝。',
    notFound: 'Stripe 上没有找到这个 id（注意测试模式和正式模式是分开的）。',
  },
} as const
