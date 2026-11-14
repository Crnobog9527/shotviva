import { expect, test } from 'vitest'

import { createSubmitLatch } from './submit-latch'

test('a dialog submits once per opening: the second press is refused until it is opened again', () => {
  const latch = createSubmitLatch()
  expect(latch.take()).toBe(true)
  expect(latch.take()).toBe(false)
  expect(latch.take()).toBe(false)
  latch.reset()
  expect(latch.take()).toBe(true)
  expect(latch.take()).toBe(false)
})
