import { beforeEach, expect, it, vi } from 'vitest'

const { config, schedule, loadDelivery, canSend, send } = vi.hoisted(() => ({
  config: vi.fn(), schedule: vi.fn<(run: () => Promise<void>) => void>(),
  loadDelivery: vi.fn(), canSend: vi.fn(), send: vi.fn(),
}))
vi.mock('./runtime-config', () => ({ runtimeFeishuConfig: config }))
vi.mock('./schedule', () => ({ schedule }))
vi.mock('./notify', () => {
  loadDelivery()
  return { getSiteErrorDelivery: () => ({ canSend, send }) }
})

beforeEach(() => {
  vi.resetModules()
  vi.resetAllMocks()
  config.mockReturnValue({ webhookUrl: 'https://example.test/mock', secret: 'mock' })
  canSend.mockReturnValue(true)
})

async function register() {
  const { registerOwnerErrorAlerts } = await import('./register')
  const { signalServerError } = await import('../analytics/server-errors')
  registerOwnerErrorAlerts()
  return () => signalServerError({ source: 'api', route: 'checkout' })
}

it('counts the first error and loads delivery only in the scheduled threshold alert', async () => {
  const paymentError = await register()
  paymentError()
  paymentError()
  expect(schedule).not.toHaveBeenCalled()
  expect(loadDelivery).not.toHaveBeenCalled()

  paymentError()
  paymentError()
  expect(schedule).toHaveBeenCalledTimes(1)
  expect(loadDelivery).not.toHaveBeenCalled()
  await schedule.mock.calls[0][0]()
  expect(loadDelivery).toHaveBeenCalledTimes(1)
  expect(send).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ total: 3, trigger: 'payment' }))

  canSend.mockReturnValue(false)
  paymentError()
  expect(schedule).toHaveBeenCalledTimes(1)
})

it('leaves delivery unloaded when alerts are disabled', async () => {
  config.mockReturnValue(null)
  const paymentError = await register()
  for (let i = 0; i < 10; i += 1) paymentError()
  expect(schedule).not.toHaveBeenCalled()
  expect(loadDelivery).not.toHaveBeenCalled()
})

it('allows a later error to schedule again after delivery throws', async () => {
  send.mockRejectedValueOnce(new Error('delivery failed'))
  const paymentError = await register()
  for (let i = 0; i < 3; i += 1) paymentError()
  await expect(schedule.mock.calls[0][0]()).rejects.toThrow('delivery failed')
  paymentError()
  expect(schedule).toHaveBeenCalledTimes(2)
})
