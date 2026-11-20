import { describe, expect, it } from 'vitest'

import { stripOptionalMark } from './strip-optional-mark'

describe('stripOptionalMark', () => {
  it.each([
    ['Dish name (optional)', 'Dish name'],
    ['Dish name（optional）', 'Dish name'],
    ['Dish name(Optional)', 'Dish name'],
    ['Dish name (OPTIONAL) ', 'Dish name'],
    ['菜名（选填）', '菜名'],
    ['菜名 （选填）', '菜名'],
    ['菜名(选填)', '菜名'],
    ['菜名 (选填)', '菜名'],
  ])('%s -> %s', (input, expected) => {
    expect(stripOptionalMark(input)).toBe(expected)
  })

  it('leaves labels without a trailing mark alone', () => {
    expect(stripOptionalMark('Dish name')).toBe('Dish name')
    expect(stripOptionalMark('菜名')).toBe('菜名')
    expect(stripOptionalMark('Optional extras (max 3)')).toBe('Optional extras (max 3)')
    expect(stripOptionalMark('选填项 说明')).toBe('选填项 说明')
  })

  it('only strips the trailing mark and keeps a label that is only the mark', () => {
    expect(stripOptionalMark('(optional) Dish name')).toBe('(optional) Dish name')
    expect(stripOptionalMark('（选填）')).toBe('（选填）')
  })
})
