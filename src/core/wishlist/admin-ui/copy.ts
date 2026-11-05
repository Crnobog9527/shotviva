import type { RequestStatus } from '../types'
import type { RequestSort } from './filter-requests'

// The review page is Chinese only and for the Owner alone, so its strings live here rather
// than in site/messages (DESIGN §7, AGENTS §9).
export const COPY = {
  title: '需求审核',
  tabs: { pending: '待审', live: '墙上', shipped: '已做出', rejected: '已拒绝' } satisfies Record<RequestStatus, string>,
  tabLabel: (status: string, count: number) => `${status}（${count}）`,
  sort: { votes: '按票数', newest: '按时间' } satisfies Record<RequestSort, string>,
  search: '搜索描述或邮箱',
  noEmail: '（邮箱缺失）',
  capped: (cap: number) => `仅显示最近 ${cap} 条`,
  empty: '这里没有需求',
  noImages: '参考图已删除',
  imageAlt: (index: number) => `参考图 ${index}`,
  shippedAs: (name: string) => `已做成模板：${name}`,
  columns: { images: '参考图', description: '描述', user: '用户', votes: '票数', created: '提交时间', actions: '操作' },
  actions: { approve: '通过', reject: '拒绝', takeDown: '下架', ship: '标记已做出' },
  reject: {
    cancel: '取消',
    reject: {
      title: '拒绝这条需求？',
      body: '用户会在 My requests 里看到 Rejected，不显示原因。参考图会被删除，无法恢复。',
      confirm: '确认拒绝',
    },
    takeDown: {
      title: '把这条需求从墙上下架？',
      body: '下架后墙上不再显示，用户看到 Rejected，不显示原因。参考图会被删除，无法恢复。',
      confirm: '确认下架',
    },
  },
  ship: { title: '标记已做出', template: '关联模板', choose: '选择模板', cancel: '取消', confirm: '确认' },
  errors: {
    CONFLICT: '这条需求的状态已经变了，请刷新页面再试。',
    NOT_FOUND: '这条需求或模板已不存在，请刷新页面。',
    generic: '操作失败，请稍后重试。',
  },
} as const
