import { describe, expect, it } from 'vitest'

import en from '@/site/messages/en.json'
import zh from '@/site/messages/zh.json'
import { redeemResult } from '@/core/codes/ui'

const failures = {
  CODE_NOT_FOUND: 'notFound', CODE_EXPIRED: 'expired', CODE_FULL: 'full', CODE_USED: 'used',
  CODE_NEW_USERS_ONLY: 'newOnly', CODE_OWN: 'own', CODE_ALREADY_INVITED: 'invited',
  CODE_CHECKOUT_IN_PROGRESS: 'checkout', CODE_INVITE_INELIGIBLE: 'ineligible',
  FORBIDDEN: 'forbidden', RATE_LIMITED: 'rate', UNAUTHORIZED: 'auth', INVALID_INPUT: 'invalid',
} as const

describe('account code redemption', () => {
  it.each(Object.entries(failures))('gives %s its own English and Chinese message', (code, key) => {
    expect(redeemResult(false, { code, message: 'untranslated server detail' })).toEqual({ kind: 'error', key })
    expect(en.app.accountCodes.redeem.errors[key]).toBeTruthy()
    expect(zh.app.accountCodes.redeem.errors[key]).toMatch(/[\u3400-\u9fff]/)
  })

  it('identifies the existing discount returned by the database before replacement', () => {
    expect(redeemResult(false, { code: 'CODE_NEEDS_CONFIRM', currentCode: 'OLD20' })).toEqual({ kind: 'confirm', old: 'OLD20' })
  })

  it('reports both effects of a combined code and tolerates non-JSON gateway errors', () => {
    expect(redeemResult(true, { status: 'ok', credits: 10, pool: 'free', percent: 25 })).toMatchObject({
      kind: 'ok', value: { credits: 10, pool: 'free', percent: 25 },
    })
    expect(redeemResult(false, null)).toEqual({ kind: 'error', key: 'unknown' })
  })
})
