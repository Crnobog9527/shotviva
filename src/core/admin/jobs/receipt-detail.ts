// Only the allow-listed billing facts enter admin views; never forward an upstream response.
function isRouterUsage(usage: Record<string, unknown> | null | undefined): usage is Record<string, unknown> {
  return !!usage && ['cost', 'prompt_tokens', 'completion_tokens'].some(key => key in usage)
}

function recordedCost(cost: number | null, raw: unknown) {
  if (cost === null) return '总成本待核'
  return typeof raw === 'number' ? `站内成本 $${cost}（含标准充值费分摊）` : `历史用量估算 $${cost}，非账单`
}

export function receiptDetail(usage: Record<string, unknown> | null | undefined, cost: number | null) {
  if (!isRouterUsage(usage)) return undefined
  const raw = typeof usage.cost === 'number' ? `OpenRouter 回执 $${usage.cost}` : '未收到 OpenRouter 金额'
  const source = usage.cost_source === 'generation' ? '（按生成编号查回）' : ''
  const parts = [raw + source]
  if (usage.is_byok === true) parts.push('BYOK 上游账单待核')
  if (usage.is_byok === undefined && cost === null && typeof usage.cost === 'number') parts.push('未确认是否使用 BYOK')
  parts.push(recordedCost(cost, usage.cost))
  if (typeof usage.estimated_cost_usd === 'number') parts.push(`用量估算 $${usage.estimated_cost_usd.toFixed(6)}，未入账`)
  if (typeof usage.generation_id === 'string') parts.push(usage.generation_id)
  return parts.join(' · ')
}
