import { AppError } from '../../errors'
import { COPY, PRODUCTS } from './copy'
import type { ProductId } from '../../config'

const messages: Record<string,string> = {
  INVALID_CODE_FIELDS: COPY.invalid, INVALID_INPUT: COPY.invalid, INVALID_DISCOUNT: COPY.invalidPercent,
  CODE_GIFT_CAP_REQUIRED: COPY.quotaRequired, CODE_GIFT_LIMIT: COPY.giftTooLarge,
  CODE_QUOTA_BELOW_CLAIMED: COPY.capped, CODE_DISCOUNT_IMMUTABLE: COPY.locked,
}
export function editorFailure(error: unknown) {
  if (!(error instanceof AppError)) return COPY.failed
  if (error.code === 'FORBIDDEN') return COPY.denied
  const cause = error.cause
  if (cause && typeof cause === 'object' && 'code' in cause) {
    if (cause.code === '23505') return COPY.already
    if (cause.code === '23514') return COPY.invalid
  }
  if (error.message.startsWith('CODE_DISCOUNT_PRODUCTS: ')) {
    const names = error.message.slice('CODE_DISCOUNT_PRODUCTS: '.length).split(', ').filter(id => Object.hasOwn(PRODUCTS,id))
    return COPY.invalidTargets(names.map(id => PRODUCTS[id as ProductId]))
  }
  return messages[error.message] ?? COPY.failed
}
