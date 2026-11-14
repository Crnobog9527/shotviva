import { describe, expect, it } from 'vitest'

import { toggleRequest } from './toggle-state'

const confirm = { title: 'Sure?', body: 'It may differ.', checkbox: 'I understand', accept: 'Turn on' }
const toggles = [{ key: 'replate', label: 'Upgrade plating', confirm }, { key: 'steam', label: 'Add steam' }]

describe('template toggles in the request (T89)', () => {
  it('sends nothing for a template without toggles', () => {
    expect(toggleRequest([], { replate: true })).toEqual({})
  })

  it('sends only the toggles that are on, and only the template’s own keys', () => {
    expect(toggleRequest(toggles, {})).toEqual({})
    expect(toggleRequest(toggles, { replate: false, steam: true, gone: true })).toEqual({ toggles: { steam: true } })
  })

  it('marks an on toggle with a confirm dialog as confirmed, and only that one', () => {
    expect(toggleRequest(toggles, { replate: true, steam: true })).toEqual({ toggles: { replate: true, steam: true }, toggles_confirmed: ['replate'] })
    expect(toggleRequest(toggles, { steam: true })).not.toHaveProperty('toggles_confirmed')
  })
})
