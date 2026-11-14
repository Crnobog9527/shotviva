import { parseArgs } from 'node:util'
import { z } from 'zod'

export const activeImportHint = '导入结果会是已上架模板。请加 --open-sale 明确开放销售，或将文件中的 isActive 设为 false 导入为下架模板。'

export function importOptions(args: string[], configuredActor?: string) {
  const { values, positionals } = parseArgs({ args, options: { 'open-sale': { type: 'boolean' } }, allowPositionals: true })
  if (positionals.length > 1) throw new Error('用法：pnpm import:prompts [文件] [--open-sale]')
  const openSale = values['open-sale'] === true
  const actor = z.uuid().safeParse(configuredActor)
  if (openSale && !actor.success) throw new Error('--open-sale 需要在本机设置 SHOTVIVA_IMPORT_ADMIN_ID，填写目标站操作管理员的用户 UUID。')
  return { file: positionals[0] ?? '.local/prompts.json', openSale, actor: openSale ? actor.data : undefined }
}

export function importFailure(error: { message: string; code: string }) {
  if (error.message === 'IMPORT_OPEN_SALE_REQUIRED') return activeImportHint
  if (error.message === 'FORBIDDEN') return '开放销售失败：SHOTVIVA_IMPORT_ADMIN_ID 必须是目标站未被停用的管理员。'
  if (['TEMPLATE_PRICE_BELOW_FLOOR','MODEL_CREDIT_FLOOR'].includes(error.message)) return '售价低于保护下限，请核对出图模型、质量档和三档积分。'
  if (error.code === 'PGRST202') return '目标数据库缺少模板销售导入接口，请先核对本站迁移状态。'
  // Database detail can contain row values, including the private prompt.
  return /^[A-Z][A-Z_]+$/.test(error.message) ? error.message : `数据库错误（${error.code}）`
}
