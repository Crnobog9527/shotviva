import type { EditScope } from '@/core/templates/edit-params'

// /admin/templates/edit copy. Admin pages are Chinese only (DESIGN §7).
export const EDIT_TEMPLATE_COPY = {
  title: '作品编辑',
  back: '← 模板与提示词',
  intro:
    '用户在作品详情页写一句话改图。先用「判断」供应商（AI 供应商页）按下面的判断指令看图和用户原话，返回范围、把握（0～1）、要保留的元素和一句概括；把握 ≥ 0.5 才采用，否则、失败或超过 3 秒用「兜底」。发给出图模型的是：封装提示词 + 该范围的约束段落（物件和背景两种会在段落后加「Keep unchanged: …」）+ 用户原话。这些文字只存在数据库里，不进仓库。',
  active: '开放作品编辑',
  activeHint: '关掉时作品详情页不显示「Edit」按钮。文字没填好之前不要打开。',
  prices: '每次编辑花费（和出图同价，不能低于下限）',
  floor: (min: number) => `下限 ${min}`,
  wrapper: '封装提示词',
  wrapperHint: '放在约束段落和用户原话前面。',
  fidelity: 'input_fidelity（只发给接受它的模型：gpt-image-1.5 高或低、gpt-image-1-mini 只能低；gpt-image-2 起不发，它们本来就按高保真读图）',
  fidelityNone: '不发送',
  classifier: '判断指令',
  classifierHint: '模型按 JSON 返回 scope（object / background / style / subject / global）、confidence、keep（最多 8 个英文短语）、change（一句英文）。指令里请说明每种范围的意思。',
  constraints: '约束段落（可以留空，留空就不加）',
  reframe: '换尺寸时的段落（可以留空）',
  reframeHint: '用户编辑时选了和原作品不同的尺寸，就把这段加在用户原话后面，例如「把画面延展到新画幅，主体位置和大小不变」。',
  save: '保存',
  saved: '已保存',
  version: (v: number) => `当前 v${v}`,
  scopes: {
    object: '只改某个物件或细节',
    background: '换背景或场景',
    style: '换风格、光线或色调',
    subject: '换主体（人、产品本身）',
    global: '整体重做',
    fallback: '兜底（判断不出、失败或超时）',
  } satisfies Record<EditScope, string>,
} as const

