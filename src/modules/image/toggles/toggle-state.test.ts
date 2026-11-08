import { describe, expect, it } from 'vitest'

import { chosenToggles, toggleRequest } from './toggle-state'

const confirm = { title: 'Sure?', body: 'It may differ.', checkbox: 'I understand', accept: 'Turn on' }
const toggles = [{ key: 'replate', label: 'Upgrade plating', confirm }, { key: 'steam', label: 'Add steam' }]

describe('template toggles in the request (T89)', () => {
  it('sends nothing for a template without toggles', () => {
    expect(toggleRequest([], { replate: true })).toEqual({})
  })

  it('sends every toggle, off unless on, and only the template’s own keys', () => {
    expect(chosenToggles(toggles, { steam: true, gone: true })).toEqual({ replate: false, steam: true })
    expect(toggleRequest(toggles, {})).toEqual({ toggles: { replate: false, steam: false } })
  })

  it('marks an on toggle with a confirm dialog as confirmed, and only that one', () => {
    expect(toggleRequest(toggles, { replate: true, steam: true })).toEqual({ toggles: { replate: true, steam: true }, toggles_confirmed: ['replate'] })
  })
})
