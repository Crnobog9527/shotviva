import { describe, expect, it } from 'vitest'

import { addScenes, removeScene, reorderScenes, sameScenes, scenesLeft, setCaption } from './hero-draft'

const s = (templateId: string, caption: string | null = null) => ({ templateId, caption })

describe('首屏大图 draft', () => {
  it('appends new templates only, never more than six', () => {
    expect(addScenes([s('a')], ['a', 'b', 'b'])).toEqual([s('a'), s('b')])
    const five = ['1', '2', '3', '4', '5'].map((id) => s(id))
    expect(addScenes(five, ['x', 'y'])).toEqual([...five, s('x')])
    expect(scenesLeft(addScenes(five, ['x']))).toBe(0)
  })

  it('keeps each caption with its template when reordered, and removes by template', () => {
    const list = [s('a', 'First'), s('b')]
    expect(reorderScenes(list, ['b', 'a'])).toEqual([s('b'), s('a', 'First')])
    expect(removeScene(list, 'a')).toEqual([s('b')])
  })

  it('turns a blank caption back into the template name', () => {
    expect(setCaption([s('a', 'x')], 'a', '  ')).toEqual([s('a')])
    expect(setCaption([s('a')], 'a', 'Same steak')).toEqual([s('a', 'Same steak')])
  })

  it('compares order and captions, ignoring surrounding spaces', () => {
    expect(sameScenes([s('a', 'x ')], [s('a', 'x')])).toBe(true)
    expect(sameScenes([s('a'), s('b')], [s('b'), s('a')])).toBe(false)
    expect(sameScenes([s('a')], [s('a', 'x')])).toBe(false)
  })
})
