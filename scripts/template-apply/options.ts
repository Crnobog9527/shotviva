import { parseArgs } from 'node:util'

import { z } from 'zod'

// Where a run may write. The test site and a local stack from this machine; production only from
// the Owner-approved GitHub workflow (template-apply.yml), never with a key on this machine.
export const PREVIEW_REF = 'pnzkiqvktkzznfbyhphe'
export const PRODUCTION_REF = 'irbqamjuazkkyvnnzupf'

export const USAGE = '用法：pnpm templates:apply <批次文件> [--dry-run]\n      pnpm templates:apply <批次文件> --production-batch   # 打印给正式站工作流的结构批次'

export type Options = { file?: string; dryRun: boolean; productionBatch: boolean }

export function readOptions(args: string[]): Options {
  const { values, positionals } = parseArgs({
    args, allowPositionals: true,
    options: { 'dry-run': { type: 'boolean' }, 'production-batch': { type: 'boolean' } },
  })
  if (positionals.length > 1) throw new Error(USAGE)
  return { file: positionals[0], dryRun: values['dry-run'] === true, productionBatch: values['production-batch'] === true }
}

const blank = (value: unknown) => (value === '' ? undefined : value)
const optional = z.preprocess(blank, z.string().min(1).optional())

export const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SHOTVIVA_IMPORT_ADMIN_ID: z.uuid({ message: '请在本机设置 SHOTVIVA_IMPORT_ADMIN_ID：目标站操作管理员的用户 UUID' }),
  NEXT_PUBLIC_ASSETS_BASE_URL: optional,
  // Set only by template-apply.yml; with it the batch comes from TEMPLATE_APPLY_BATCH.
  TEMPLATE_APPLY_TARGET: z.preprocess(blank, z.enum(['production']).optional()),
  TEMPLATE_APPLY_BATCH: optional,
  GITHUB_ACTIONS: optional,
})
export type Env = z.infer<typeof envSchema>

export type Target = 'preview' | 'local' | 'production'

// The database the URL points at, refusing production outside the workflow.
export function targetOf(env: Env): Target {
  const host = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname
  if (host === `${PRODUCTION_REF}.supabase.co`) {
    if (env.TEMPLATE_APPLY_TARGET !== 'production' || env.GITHUB_ACTIONS !== 'true') {
      throw new Error('正式站只能经 GitHub 工作流 template-apply.yml（Owner 批准）执行，本机不写正式库。')
    }
    return 'production'
  }
  if (env.TEMPLATE_APPLY_TARGET === 'production') throw new Error('工作流只写正式库')
  if (host === `${PREVIEW_REF}.supabase.co`) return 'preview'
  if (host === '127.0.0.1' || host === 'localhost') return 'local'
  throw new Error('NEXT_PUBLIC_SUPABASE_URL 既不是测试库也不是本地库')
}
