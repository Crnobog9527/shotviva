import type { BulkTicketSkip } from '@/core/support/rules/bulk'

// The batch copy on /admin/tickets (DESIGN §7: Chinese only).
export const TICKETS_BULK_COPY = {
  actions: { reply: '批量回复', close: '批量关闭' },
  closedLocked: '已关闭的工单不能批量操作',
  targets: '涉及的工单',
  close: {
    title: (n: number) => `关闭 ${n} 个工单？`,
    body: '只关闭，不写回复，不给用户发邮件。已关闭的、退款申请还没做决定的、续费还没核对的会跳过，并在结果里写明原因。',
    confirm: (n: number) => `确认关闭 ${n} 个`,
  },
  reply: {
    title: (n: number) => `给 ${n} 个工单回复同一条内容`,
    body: '每个工单收到同一条回复，用户在「Help & feedback」里看到；不能带图片。退款申请还没做决定的、已关闭的会跳过。',
    label: '回复内容',
    placeholder: '写给这些用户的回复',
    alsoClose: '回复后同时关闭（勾选时，续费还没核对的工单整个跳过，不回复也不关闭）',
    preview: '预览',
    previewTitle: (n: number) => `确认发送给 ${n} 个工单？`,
    previewBody: (n: number, close: boolean) =>
      `将给 ${n} 个工单各回复下面这段话${close ? '并关闭' : ''}，每个工单的作者会收到一封「有新回复」的邮件。发出后不能撤回。`,
    previewLabel: '用户看到的回复',
    send: (n: number) => `确认发送给 ${n} 个`,
    back: '返回修改',
  },
  skips: {
    missing: '工单已不存在',
    closed: '已经关闭',
    refund_undecided: '退款申请还没做决定，请在工单里逐个处理',
    renewal_pending: '续费还没核对，不能关闭',
    failed: '保存失败，可以重试',
  } satisfies Record<BulkTicketSkip, string>,
} as const
