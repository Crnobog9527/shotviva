import { logger } from '../logger'
import { PRE_T75_TEMPLATE_COLUMNS, TEMPLATE_COLUMNS } from './types'

type Outcome<T> = { data: T | null; error: { code?: string; message: string } | null }

// PostgREST's answers when templates.category_key / template_categories do not exist yet: an
// unknown embedded relationship, or an unknown column.
function isPreT75(error: { code?: string; message: string }): boolean {
  return error.code === 'PGRST200' || (error.code === '42703' && error.message.includes('category_key'))
}

// Runs one template read with TEMPLATE_COLUMNS, and again with the pre-T75 columns when the
// database is still before migrations 0580–0583 (a deployment promoted before the DB push, or
// a database restored to before it). toTemplate reads either row. `extra` is appended to the
// column list (e.g. the prompt embed). Goes with the card that drops templates.category.
export async function selectTemplates<T>(read: (columns: string) => PromiseLike<Outcome<T>>, extra = ''): Promise<Outcome<T>> {
  const first = await read(TEMPLATE_COLUMNS + extra)
  if (!first.error || !isPreT75(first.error)) return first
  logger.warn('templates.pre_t75_schema', { code: first.error.code })
  return read(PRE_T75_TEMPLATE_COLUMNS + extra)
}
