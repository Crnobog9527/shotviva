import { parseArgs } from 'node:util'

import { z } from 'zod'

// Where a run may write: the test site or a local stack, never production. Templates reach
// production only through the T93 sync workflow, with the Owner's approval.
export const PREVIEW_REF = 'pnzkiqvktkzznfbyhphe'

export const USAGE = '用法：pnpm templates:apply <批次文件> [--dry-run]'

export type Options = { file: string; dryRun: boolean }

export function readOptions(args: string[]): Options {
  const { values, positionals } = parseArgs({
    args, allowPositionals: true,
    options: { 'dry-run': { type: 'boolean' } },
  })
  if (positionals.length !== 1) throw new Error(USAGE)
  return { file: positionals[0], dryRun: values['dry-run'] === true }
}

const blank = (value: unknown) => (value === '' ? undefined : value)
const optional = z.preprocess(blank, z.string().min(1).optional())

export const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SHOTVIVA_IMPORT_ADMIN_ID: z.uuid({ message: '请在本机设置 SHOTVIVA_IMPORT_ADMIN_ID：目标站操作管理员的用户 UUID' }),
  NEXT_PUBLIC_ASSETS_BASE_URL: optional,
})
export type Env = z.infer<typeof envSchema>

export type Target = 'preview' | 'local'

// The database the URL points at; anything but the test site or a local stack is refused.
export function targetOf(env: Env): Target {
  const host = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname
  if (host === `${PREVIEW_REF}.supabase.co`) return 'preview'
  if (host === '127.0.0.1' || host === 'localhost') return 'local'
  throw new Error('只能写测试库或本地库；正式站一律走 T93 模板同步工作流。')
}
