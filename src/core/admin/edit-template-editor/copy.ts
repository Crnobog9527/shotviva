import type { EditScope } from '@/core/templates/edit-params'

// /admin/templates/edit copy. Admin pages are Chinese only (DESIGN §7).
export const EDIT_TEMPLATE_COPY = {
  title: '作品编辑',
  back: '← 模板与提示词',
  intro:
    '用户在作品详情页写一句话改图。先用「判断」供应商（AI 供应商页）对下面五道判断题各给一个概率，取最高且 ≥ 0.5 的范围；都不到 0.5、失败或超过 3 秒就用「兜底」。发给出图模型的是：封装提示词 + 该范围的约束段落 + 用户原话。这些文字只存在数据库里，不进仓库。',
  active: '开放作品编辑',
  activeHint: '关掉时作品详情页不显示「Edit」按钮。文字没填好之前不要打开。',
  prices: '每次编辑花费（和出图同价，不能低于下限）',
  floor: (min: number) => `下限 ${min}`,
  wrapper: '封装提示词',
  wrapperHint: '放在约束段落和用户原话前面。',
  fidelity: 'input_fidelity（模型支持时才填）',
  fidelityNone: '不发送',
  questions: '判断题（每题对应一种范围，返回「是」的概率）',
  constraints: '约束段落（可以留空，留空就不加）',
  save: '保存',
  saved: '已保存',
  version: (v: number) => `当前 v${v}`,
  scopes: {
    object: '只改某个物件或细节',
    background: '换背景或场景',
    style: '换风格、光线或色调',
    subject: '换主体（人、产品本身）',
    overall: '整体重做',
    fallback: '兜底（判断不出、失败或超时）',
  } satisfies Record<EditScope, string>,
} as const

