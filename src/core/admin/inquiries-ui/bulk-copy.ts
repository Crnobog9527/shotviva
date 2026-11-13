import type { BulkInquirySkip } from '@/core/inquiries/rules'

// The batch copy on /admin/inquiries (DESIGN §7: Chinese only).
export const INQUIRIES_BULK_COPY = {
  actions: { status: '批量改状态', export: '导出 CSV', emails: '复制邮箱' },
  targets: '涉及的咨询',
  status: {
    title: (n: number) => `修改 ${n} 条咨询的状态`,
    body: '只改跟进状态，备注保持不变，也不会给对方发任何邮件。已经是这个状态的会跳过。',
    legend: '改成',
    confirm: (n: number, label: string) => `确认把 ${n} 条改成「${label}」`,
  },
  exported: (n: number) => `已下载 ${n} 条咨询的 CSV`,
  copied: (n: number) => `已复制 ${n} 个邮箱，可以粘到邮件的密送栏`,
  copyFailed: '复制失败：浏览器不允许读写剪贴板',
  fileName: (date: string) => `企业咨询-${date}.csv`,
  skips: {
    missing: '这条咨询已不存在',
    same: '已经是这个状态',
    failed: '保存失败，可以重试',
  } satisfies Record<BulkInquirySkip | 'failed', string>,
} as const
