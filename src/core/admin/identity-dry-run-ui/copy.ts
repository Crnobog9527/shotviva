import { DRY_RUN_MAX_CHARS, DRY_RUN_MAX_LINES } from '../identity-dry-run/types'

// The face-swap dry run on /admin/providers (ARCHITECTURE §5.1a, T81). Admin pages are Chinese
// only (DESIGN §7).
export const DRY_RUN_COPY = {
  title: '换脸判断试跑',
  intro: `每行一句，最多 ${DRY_RUN_MAX_LINES} 行、每行 ${DRY_RUN_MAX_CHARS} 字。交给当前启用的判断模型，和用户出图时问的是同一个问题、同一段提示词。不出图、不扣积分、不留拒绝记录，只花判断模型的调用费。`,
  placeholder: '让他笑一下\n把他的脸换成第二张图的人\nmake her look like Taylor Swift',
  run: '试跑',
  running: '正在逐句判断…',
  errors: {
    empty: '先写几句再试。',
    too_many_lines: `一次最多 ${DRY_RUN_MAX_LINES} 行。`,
    line_too_long: `有一行超过 ${DRY_RUN_MAX_CHARS} 字。`,
    failed: '试跑失败，请重试。',
  } as Record<string, string>,
  columns: { text: '句子', model: '判断结论', ms: '耗时 ms', tokens: 'token 入 / 出' },
  refuse: '拒绝',
  allow: '放行',
  none: '—',
  noProvider: '没有启用的判断模型：所有请求都会放行',
  summary: (n: number, refused: number, p50: number, p95: number) => `${n} 句，拒绝 ${refused} 句 · 耗时中位 ${p50} ms，95% 在 ${p95} ms 内`,
  tokens: (input: number, output: number) => `平均每次 ${input} / ${output} token`,
  cost: (usd: string) => `约 $${usd} / 次`,
  model: (name: string, version: string) => `模型：${name}（提示词 ${version}）`,
  json: '复制为例句录制 JSON（examples.recorded.json）',
  copied: '已复制',
}
