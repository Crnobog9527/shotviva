import { AppError } from '@/core/errors'

// The messages the category SQL functions raise (supabase/migrations/0582), as the admin
// reads them. Admin is Chinese-only (DESIGN §7).
const MESSAGES: Record<string, string> = {
  CATEGORY_NOT_FOUND: '这个分类已经不存在了，请刷新页面',
  CATEGORY_KEY_TAKEN: '这个标识已经被别的分类用了，换一个',
  CATEGORY_NAME_EN_TAKEN: '已经有分类叫这个英文名了（不分大小写）',
  CATEGORY_NAME_ZH_TAKEN: '已经有分类叫这个中文名了',
  CATEGORY_SYSTEM: '这是内置模板用的系统分类，不能修改或删除',
  CATEGORY_HAS_CHILDREN: '请先移动或删除子分类',
  CATEGORY_LAST: '至少要保留一个分类',
  CATEGORY_MOVE_REQUIRED: '这个分类下还有模板，先选要移到哪个分类',
  NOT_ADMIN: '只有管理员能修改分类',
}

// Two saves racing past the function's own checks hit a unique index instead.
const TAKEN = '名称已被使用，请换一个（中英文名称和标识都不能和别的分类重复）'

export function categoryRpcError(fn: string, error: { message: string; code?: string }): AppError {
  if (error.code === '23505') return new AppError('INVALID_INPUT', TAKEN)
  const message = MESSAGES[error.message]
  if (message) return new AppError(error.message === 'NOT_ADMIN' ? 'FORBIDDEN' : 'INVALID_INPUT', message)
  if (error.message === 'INVALID_INPUT') return new AppError('INVALID_INPUT', '填写的内容不符合要求，请检查后再保存')
  return new AppError('INTERNAL', `rpc ${fn} failed`, { cause: error })
}
