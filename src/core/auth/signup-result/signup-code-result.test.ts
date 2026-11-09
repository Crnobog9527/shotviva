import { expect, it } from 'vitest'

import { parseSignupResult } from './use-signup-result'

it('accepts only bounded numeric effects from the display cookie', () => {
  const combined = { credits: 50, pool: 'paid', percent: 25 }
  expect(parseSignupResult(encodeURIComponent(JSON.stringify(combined)))).toEqual(combined)
  expect(parseSignupResult('{"credits":0,"pool":null,"percent":20}')).toMatchObject({ percent: 20 })
  for (const raw of ['%XX', 'null', '{}', '{"credits":5,"pool":"alien","percent":100}', '{"credits":0,"pool":null,"percent":0}']) {
    expect(parseSignupResult(raw)).toBeNull()
  }
})
