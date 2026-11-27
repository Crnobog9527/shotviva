import { expect, it } from 'vitest'
import { feeScheduleInput } from './payment-fee-input'

const form = (fields: Record<string, string>) => {
  const f = new FormData()
  for (const [k, v] of Object.entries(fields)) f.set(k, v)
  return f
}
const add = { channel: 'waffo', method: 'wechat_pay', kind: 'acquiring', rounding: 'ceil', percent: '3.9', fixed: '', effective_from: '2026-12-01T00:00' }

it('turns the add form into cents and a UTC timestamp', () => {
  expect(feeScheduleInput(form(add))).toMatchObject({ rate_bp: 390, fixed_cents: 0, effective_from: '2026-12-01T00:00:00Z', rounding: 'ceil' })
})
it('rejects a version with no rate, an unknown channel or a bad amount', () => {
  expect(() => feeScheduleInput(form({ ...add, percent: '0', fixed: '0' }))).toThrow()
  expect(() => feeScheduleInput(form({ ...add, channel: 'paypal' }))).toThrow()
  expect(() => feeScheduleInput(form({ ...add, fixed: '-1' }))).toThrow()
})
it('sends only active and note when editing, never a rate', () => {
  const input = feeScheduleInput(form({ id: '7', expected_updated_at: '2026-11-21T00:00:00Z', active: 'on', note: ' x ', percent: '9' }))
  expect(input).toEqual({ id: '7', expected_updated_at: '2026-11-21T00:00:00Z', active: true, note: 'x' })
})
