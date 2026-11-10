import { beforeEach, expect, it, vi } from 'vitest'
import { notifyOwner } from '../alerts'
import { AppError } from '../errors'
import { routeFallbackReason, withFallbackNotice } from './fallback-notice'

vi.mock('../alerts', () => ({ notifyOwner: vi.fn() }))
beforeEach(() => vi.clearAllMocks())

function attempt(reason: string | undefined, error?: Error) {
  return withFallbackNotice('fixture', async selected => {
    selected(reason)
    if (error) throw error
    return 'ok'
  })
}

const priceRefusal = new AppError('TEMPLATE_UNAVAILABLE', 'temporarily unavailable')

it.each(['catalog_unavailable', 'model_missing', 'unsupported_resolution'])(
  'reports a web %s fallback and a later price refusal', async reason => {
    const provider = { id: 'default/model', fallbackReason: reason, generate: vi.fn() }
    expect(routeFallbackReason(provider, 'cheap', 'web')).toBe(reason)
    await expect(attempt(reason)).resolves.toBe('ok')
    await expect(attempt(reason, priceRefusal)).rejects.toBe(priceRefusal)
    for (const [index, rejected] of [false, true].entries()) {
      expect(notifyOwner).toHaveBeenNthCalledWith(index + 1, { kind: 'template_fallback', templateId: 'fixture', reason, rejected })
    }
    expect(routeFallbackReason(provider, 'default', 'web')).toBeUndefined()
    expect(routeFallbackReason(provider, null, 'web')).toBeUndefined()
  },
)

it.each([new AppError('CREDITS_INSUFFICIENT', 'credits'), new AppError('TEMPLATE_QUOTE_CHANGED', 'quote'), new Error('references')])(
  'propagates %s without classifying it as a price refusal', async error => {
    await expect(attempt('model_missing', error)).rejects.toBe(error)
    expect(notifyOwner).toHaveBeenCalledWith({ kind: 'template_fallback', templateId: 'fixture', reason: 'model_missing', rejected: false })
    await expect(attempt('partner_channel', error)).rejects.toBe(error)
    expect(notifyOwner).toHaveBeenCalledTimes(1)
  },
)

it('only alerts on a price refusal for the partner channel', async () => {
  const provider = { id: 'default/model', generate: vi.fn() }
  const reason = routeFallbackReason(provider, 'cheap', 'graylum')
  expect(reason).toBe('partner_channel')
  await expect(attempt(reason)).resolves.toBe('ok')
  expect(notifyOwner).not.toHaveBeenCalled()
  await expect(attempt(reason, priceRefusal)).rejects.toBe(priceRefusal)
  expect(notifyOwner).toHaveBeenCalledExactlyOnceWith({ kind: 'template_fallback', templateId: 'fixture', reason, rejected: true })
})
