import { formatTable } from '../template-apply/report'
import type { CellResult } from './runner'

// One row per template and prompt version: how many results succeeded, failed or were skipped, and
// what this run spent (runs reused from earlier cost nothing now).
export function summaryTable(results: CellResult[]): string {
  const groups = new Map<string, CellResult[]>()
  for (const result of results) {
    const key = `${result.cell.templateId} v${result.cell.version}`
    groups.set(key, [...(groups.get(key) ?? []), result])
  }
  const rows = [...groups].map(([item, list]) => {
    const count = (outcome: CellResult['outcome']) => list.filter(r => r.outcome === outcome).length
    const reused = list.filter(r => r.reused).length
    const spent = list.filter(r => !r.reused).reduce((sum, r) => sum + (r.run ? r.run.costUsd ?? r.run.estimateUsd : 0), 0)
    const codes = [...new Set(list.map(r => r.code).filter(Boolean))].join(',')
    return {
      item, ok: count('failed') === 0,
      actions: `成功 ${count('succeeded')}（复用 ${reused}）· 失败 ${count('failed')} · 跳过 ${count('skipped') + count('running')}`,
      result: `$${spent.toFixed(3)}${codes ? ' ' + codes : ''}`,
    }
  })
  return formatTable(rows)
}
