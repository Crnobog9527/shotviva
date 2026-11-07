import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import manifest from './manifest'

// T58: every icon the manifest lists must ship in public/, or browsers drop it silently.
describe('web app manifest', () => {
  it('lists the 192 and 512 "S." icons that exist in public/', () => {
    const { icons = [], name } = manifest()
    expect(name).toBe('Shotviva')
    expect(icons.map((icon) => icon.sizes)).toEqual(['192x192', '512x512'])
    for (const icon of icons) expect(existsSync(join(process.cwd(), 'public', icon.src))).toBe(true)
  })
})
