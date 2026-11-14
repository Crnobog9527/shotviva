import type { SaleFloorExample } from '@/core/alerts/alert-kinds'

// 1295: why a published template is missing from the catalogue, on its admin row. The same
// report feeds the Owner's Feishu alert (core/alerts/sale-floor.ts).
const BASIS: Record<string, string> = { p95: '近 30 天实测 p95', estimate: '后台估价', catalog: '供应商目录价', list: 'OpenAI 保守价' }
const REASON: Record<string, string> = {
  sale_closed: '未开放销售', unpriced: '1K 未定价', no_route: '没有可用模型', route_unsupported: '模型不支持 1K',
}

export const CATALOGUE_GAP_LABEL = '不在创作页'

export function catalogueGapText(gap: SaleFloorExample): string {
  if (gap.reason !== 'below_floor') return REASON[gap.reason] ?? gap.reason
  if (gap.floor === null) return '模型无法定价，不能出售'
  const samples = gap.basis === 'p95' && gap.samples !== null ? `，${gap.samples} 张` : ''
  return `1K 售价低于成本下限：需 ≥${gap.floor} 积分（按${BASIS[gap.basis ?? ''] ?? '成本'}${samples}）`
}
