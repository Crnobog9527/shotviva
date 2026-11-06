import { describe, expect, it } from 'vitest'

import { coverFileName, formatBytes } from './cover-file'

describe('cover card file line', () => {
  it('names the stored file from its public URL', () => {
    expect(coverFileName('https://shotviva.com/assets/covers/pure-white/0a1b2c.webp')).toBe('0a1b2c.webp')
    expect(coverFileName('/assets/covers/x/motion%20one.mp4?v=2#t')).toBe('motion one.mp4')
    expect(coverFileName('/assets/covers/x/%E0%A4%A.webp')).toBe('%E0%A4%A.webp')
  })

  it('formats sizes the way the limits are written', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(240 * 1024)).toBe('240 KB')
    expect(formatBytes(3.46 * 1024 * 1024)).toBe('3.5 MB')
  })
})
