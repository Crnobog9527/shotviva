import { describe, expect, it } from 'vitest'

import { keyboardSort, moveTo, type Lifted } from './keyboard-sort'

const ids = ['a', 'b', 'c', 'd']

// Feeds keys to the step function the way the list does: each key sees the order on screen.
function press(keys: string[], id: string, start: readonly string[] = ids) {
  let lifted: Lifted | null = null
  let commit: string[] | undefined
  const announced: string[] = []
  for (const key of keys) {
    const step = keyboardSort(lifted, key, id, lifted?.order ?? start, id.toUpperCase())
    lifted = step.lifted
    if (step.commit) commit = step.commit
    if (step.announce) announced.push(step.announce)
  }
  return { lifted, commit, announced }
}

describe('moveTo', () => {
  it('moves one id to a new index and clamps to the ends', () => {
    expect(moveTo(ids, 3, 1)).toEqual(['a', 'd', 'b', 'c'])
    expect(moveTo(ids, 0, 3)).toEqual(['b', 'c', 'd', 'a'])
    expect(moveTo(ids, 1, 99)).toEqual(['a', 'c', 'd', 'b'])
  })
})

describe('keyboard sorting', () => {
  it('space picks up, arrows move, space drops and saves the whole new order', () => {
    const { lifted, commit, announced } = press([' ', 'ArrowUp', 'ArrowUp', ' '], 'd')
    expect(lifted).toBeNull()
    expect(commit).toEqual(['a', 'd', 'b', 'c'])
    expect(announced).toEqual([
      '已拿起「D」，现在第 4 位，共 4 个。',
      '「D」移到第 3 位，共 4 个。',
      '「D」移到第 2 位，共 4 个。',
      '「D」放在第 2 位，共 4 个，正在保存。',
    ])
  })

  it('Enter works like space', () => {
    expect(press(['Enter', 'ArrowDown', 'Enter'], 'a').commit).toEqual(['b', 'a', 'c', 'd'])
  })

  it('Escape puts the row back and saves nothing', () => {
    const { lifted, commit, announced } = press([' ', 'ArrowDown', 'ArrowDown', 'Escape'], 'b')
    expect(lifted).toBeNull()
    expect(commit).toBeUndefined()
    expect(announced.at(-1)).toBe('已取消，「B」回到第 2 位，共 4 个。')
  })

  it('stops at either end and does not save a drop back where it started', () => {
    const top = press([' ', 'ArrowUp', 'ArrowUp'], 'a')
    expect(top.lifted?.order).toEqual(ids)
    const back = press([' ', 'ArrowDown', 'ArrowUp', ' '], 'c')
    expect(back.commit).toBeUndefined()
    expect(back.announced.at(-1)).toBe('「C」已放下，顺序没变。')
  })

  it('leaves other keys to the browser, lifted or not', () => {
    expect(keyboardSort(null, 'ArrowDown', 'a', ids, 'A')).toEqual({ handled: false, lifted: null })
    const lifted: Lifted = { id: 'a', original: ids, order: ids }
    expect(keyboardSort(lifted, 'Tab', 'a', ids, 'A')).toEqual({ handled: false, lifted })
  })
})
