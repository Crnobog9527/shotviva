import { z } from 'zod'

import type { PlanItem } from './plan-types'

// The per-item result table. Ids, actions and error codes only: never a prompt, a key or a
// login link. Database details are shown only for our own error codes (see migration 1260).

export const batchResultSchema = z.array(z.object({
  ref: z.string(), ok: z.boolean(), code: z.string().optional(), detail: z.string().nullable().optional(),
  sqlstate: z.string().optional(), constraint: z.string().nullable().optional(),
}))
export type BatchResult = z.infer<typeof batchResultSchema>[number]

const MESSAGES: Record<string, string> = {
  NOT_ADMIN: '操作人不是这个站的管理员', FORBIDDEN: '操作人不是这个站的管理员',
  CATEGORY_NOT_FOUND: '分类不存在', CATEGORY_KEY_TAKEN: '分类标识已被占用',
  CATEGORY_NAME_EN_TAKEN: '已有分类叫这个英文名（同一类分类里名称不能重复）',
  CATEGORY_NAME_ZH_TAKEN: '已有分类叫这个中文名（同一类分类里名称不能重复）',
  INVALID_PARENT: '父分类不对：会形成循环、超过三级或是系统分类', CATEGORY_CHANGED: '分类位置刚被别人改过，请重跑',
  CATEGORY_SYSTEM: '系统分类不能修改', STALE_TEMPLATE_ASSIGNMENT: '分类或系列刚被别人改过，请重跑',
  STALE_PROMPT: '提示词刚被别人改过，请重跑', SYSTEM_ASSIGNMENT: '内置模板的分类与系列不能改',
  SERIES_NOT_FOUND: '系列不存在', TEMPLATE_EXISTS: '模板 ID 已被占用', TEMPLATE_NOT_FOUND: '模板不存在',
  MODEL_CHANGED: '出图模型或报价刚有变化，请重跑', MODEL_CREDIT_FLOOR: '积分低于所选模型下限',
  TEMPLATE_PRICE_BELOW_FLOOR: '售价低于成本下限', TEMPLATE_RETIRED: '当前目录未开放这个模板销售',
  MODEL_REFERENCE_LIMIT: '用户照片加参考图的张数超出模型允许范围', UNPUBLISH_FIRST: '先下架，再关闭销售',
  INVALID_SERIES_CATEGORY: '系列分类不能用', INVALID_SERIES_MEMBERS: '系列成员里有不存在或内置的模板',
  SERIES_MEMBER_TAKEN: '成员已在别的系列（在模板上写 series 把它移过来）', SERIES_REASON_REQUIRED: '系列下架要写原因',
  TEST_RUN_NOT_FOUND: '试跑记录不存在、未成功或不属于这个模板', TRANSLATE_TARGET_ONLY: '翻译试跑只能做该语言的后图',
  INVALID_INPUT: '参数不符合要求',
}

export function failureText(result: BatchResult) {
  const code = result.code ?? 'DB_ERROR'
  if (code === 'DB_ERROR' && result.sqlstate === '23505') return `重复：${result.constraint ?? '唯一约束'}`
  if (code === 'DB_ERROR') return `数据库错误（${result.sqlstate ?? '?'}${result.constraint ? `，${result.constraint}` : ''}）`
  return [code, MESSAGES[code], result.detail].filter(Boolean).join('：')
}

export type Row = { item: string; actions: string; result: string; ok: boolean }

// A batch is all or nothing: one failure anywhere (found here or in the database) keeps nothing.
export function rows(plan: PlanItem[], results: Map<string, BatchResult>, dryRun: boolean): Row[] {
  const failed = plan.some(item => item.problems.length > 0) || [...results.values()].some(result => !result.ok)
  const done = dryRun ? '通过（已回滚）' : failed ? '已回滚（同批有失败）' : '完成'
  return plan.map(item => {
    const actions = item.actions.join('、') + (item.notes.length ? `（${item.notes.join('；')}）` : '')
    const base = { item: `${item.kind} ${item.label}`, actions }
    if (item.problems.length) return { ...base, ok: false, result: `未执行：${item.problems.join('；')}` }
    if (item.ops.length === 0) return { ...base, ok: true, result: '—' }
    const result = results.get(item.ref)
    if (!result) return { ...base, ok: true, result: dryRun ? '未检查（同批有本地问题）' : '未执行（同批有失败）' }
    if (!result.ok) return { ...base, ok: false, result: `失败 ${failureText(result)}` }
    return { ...base, ok: true, result: done }
  })
}

export function formatTable(list: Row[]): string {
  const width = (text: string) => [...text].reduce((n, ch) => n + (/[　-￿]/.test(ch) ? 2 : 1), 0)
  const pad = (text: string, size: number) => text + ' '.repeat(Math.max(0, size - width(text)))
  const head = { item: '项目', actions: '动作', result: '结果', ok: true }
  const all = [head, ...list]
  const a = Math.max(...all.map(r => width(r.item)))
  const b = Math.min(48, Math.max(...all.map(r => width(r.actions))))
  return all.map(r => `${pad(r.item, a)}  ${pad(r.actions, b)}  ${r.result}`).join('\n')
}
