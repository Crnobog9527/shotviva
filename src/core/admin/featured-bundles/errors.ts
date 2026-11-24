import { AppError } from '@/core/errors'

// What the 精选组合 SQL functions raise (migrations 2004, 2005), as the admin reads them. Admin is
// Chinese-only (DESIGN §7). Null: not one of these, the caller maps it.
const MESSAGES: Record<string, string> = {
  BUNDLE_SIZE: '一个组合要放 2 到 8 个模板',
  BUNDLE_NOT_FOUND: '这个组合已经不存在了，请刷新页面',
  NOT_ADMIN: '只有管理员能修改精选组合',
}

export function bundleRpcError(error: { message: string }): AppError | null {
  const message = MESSAGES[error.message]
  if (!message) return null
  return new AppError(error.message === 'NOT_ADMIN' ? 'FORBIDDEN' : 'INVALID_INPUT', message)
}

export function bundleError(fn: string, error: { message: string; code?: string }): AppError {
  if (error.message === 'INVALID_INPUT') return new AppError('INVALID_INPUT', '组合里只能放已上架、在网站上显示的模板，名称中英文都要填，模板不能重复')
  return bundleRpcError(error) ?? new AppError('INTERNAL', `rpc ${fn} failed`, { cause: error })
}
