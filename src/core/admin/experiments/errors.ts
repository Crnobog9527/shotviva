// What the admin sees when a change is refused (DESIGN §7: Chinese only).
export const EXPERIMENT_ERRORS = {
  input: '内容不完整：名称必填，版本 2–4 个，必须有且只有一个对照组，权重 0–100。',
  option: '有版本选了代码里没有的内容，请刷新页面后重选。',
  duplicate: '同一个实验里两个版本不能选同样的内容。',
  live: '这个位置已经有一个进行中或暂停的实验，先结束它再开始新的。',
  noWeight: '所有版本的权重都是 0，至少给一个版本大于 0 的权重。',
  state: '实验的状态已经变了（可能别人刚操作过），请刷新页面。',
  variant: '选的版本不对：对照组不能归档，换到的版本必须是这个实验里还没归档的版本。',
  notFound: '实验不存在，可能已被删除，请刷新页面。',
  notDraft: '实验已经开始过，版本不能再改。要换版本，请结束它再新建一个。',
} as const

const BY_DATABASE: Readonly<Record<string, keyof typeof EXPERIMENT_ERRORS>> = {
  EXPERIMENT_VARIANTS_INVALID: 'input',
  EXPERIMENT_NOT_DRAFT: 'notDraft',
  EXPERIMENT_NO_WEIGHT: 'noWeight',
  EXPERIMENT_BAD_STATE: 'state',
  EXPERIMENT_VARIANT_INVALID: 'variant',
  EXPERIMENT_NOT_FOUND: 'notFound',
}

export function experimentErrorFor(error: { message: string; code?: string }): keyof typeof EXPERIMENT_ERRORS | null {
  if (error.code === '23505') return 'live'
  return BY_DATABASE[error.message] ?? null
}
