import { parseArgs } from 'node:util'
import { relative, resolve, sep } from 'node:path'

import { z } from 'zod'

import { assertQaTarget, DEFAULT_SITE_URL, LOCAL_REF, PREVIEW_REF } from '../qa/target'

// Where a run may write: the test site or a local stack, never production (templates reach
// production only through the T93 sync workflow). The database is checked like the QA scripts'
// (https <ref>.supabase.co, a service key of that same project); the buckets and the cover base
// are fixed per target, so a .env.local that holds another environment's storage settings cannot
// send covers or style references anywhere else.

export const USAGE = '用法：pnpm templates:apply .local/<路径>/<批次文件>.json [--dry-run]'

export type Options = { file: string; dryRun: boolean }

// Batch files carry private prompts: only from a gitignored .local/ folder.
export function localBatchPath(raw: string, cwd = process.cwd()): string {
  const file = resolve(cwd, raw)
  if (!file.split(sep).includes('.local')) throw new Error(`批次文件要放在 .local/ 下（不进 git）：${relative(cwd, file)}`)
  return file
}

export function readOptions(args: string[], cwd = process.cwd()): Options {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { 'dry-run': { type: 'boolean' } } })
  if (positionals.length !== 1) throw new Error(USAGE)
  return { file: localBatchPath(positionals[0], cwd), dryRun: values['dry-run'] === true }
}

const blank = (value: unknown) => (value === '' ? undefined : value)
const optional = z.preprocess(blank, z.string().min(1).optional())

export const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SHOTVIVA_IMPORT_ADMIN_ID: z.uuid({ message: '请在本机设置 SHOTVIVA_IMPORT_ADMIN_ID：目标站操作管理员的用户 UUID' }),
  // Only compared with the fixed values below: a different one means .env.local is for another site.
  R2_BUCKET: optional, R2_PUBLIC_BUCKET: optional, NEXT_PUBLIC_ASSETS_BASE_URL: optional,
  // The test site's catalogue cache (POST /api/template-sync/revalidate); without it the site
  // shows the changes within the hour.
  TEMPLATE_SYNC_REVALIDATE_SECRET: optional,
})
export type Env = z.infer<typeof envSchema>

export type Target = {
  name: 'preview' | 'local'
  // Where files go; null on a local stack, which has no buckets (a dry run still checks them).
  storage: { privateBucket: string; publicBucket: string; assetsBase: string } | null
  // A dry run's placeholder base for cover URLs on a target without storage.
  assetsBase: string
  site: string | null
}

const PREVIEW_STORAGE = {
  privateBucket: 'shotviva-preview', publicBucket: 'shotviva-assets-preview',
  assetsBase: 'https://pub-a55455bd73cf4b79827ce1f299ac1ca1.r2.dev',
}

function checkStorage(env: Env, storage: typeof PREVIEW_STORAGE) {
  const wrong = [['R2_BUCKET', env.R2_BUCKET, storage.privateBucket], ['R2_PUBLIC_BUCKET', env.R2_PUBLIC_BUCKET, storage.publicBucket],
    ['NEXT_PUBLIC_ASSETS_BASE_URL', env.NEXT_PUBLIC_ASSETS_BASE_URL?.replace(/\/+$/, ''), storage.assetsBase]]
    .filter(([, given, fixed]) => given !== undefined && given !== fixed).map(([name]) => name)
  if (wrong.length) throw new Error(`.env.local 的 ${wrong.join('、')} 不是测试站的设置，停止（封面和参考图只写测试站的桶）`)
}

export function targetOf(env: Env): Target {
  let ref: string
  try {
    ref = assertQaTarget({ supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL, serviceKey: env.SUPABASE_SERVICE_ROLE_KEY, extraRefs: LOCAL_REF })
  } catch (error) {
    throw new Error(`只能写测试库或本地库；正式站一律走 T93 模板同步工作流。（${error instanceof Error ? error.message : 'invalid target'}）`)
  }
  if (ref === LOCAL_REF) return { name: 'local', storage: null, assetsBase: 'https://assets.local.test', site: null }
  if (ref !== PREVIEW_REF) throw new Error('只能写测试库或本地库')
  checkStorage(env, PREVIEW_STORAGE)
  return { name: 'preview', storage: PREVIEW_STORAGE, assetsBase: PREVIEW_STORAGE.assetsBase, site: DEFAULT_SITE_URL }
}
