import { describe, expect, it } from 'vitest'

import { DISH_NAME_MAX, dishReadingSchema, dishText, userDishName } from './reading'

const reading = {
  dish_name: 'Steamed whole fish',
  main_ingredients: [{ name: 'whole fish', color: 'grey-silver skin' }, { name: 'chicken', color: 'black skin' }],
  sauce: 'dark amber soy',
  garnish: [{ item: 'scallion', shape: 'fine rings', count: 'a small pinch' }, { item: '', shape: 'x', count: '1' }],
  dishware: 'white oval platter',
  category: 'long',
}

describe('the dish reading (§5.1c)', () => {
  it('turns the reading into labelled facts, colours kept with each ingredient', () => {
    expect(dishText(dishReadingSchema.parse(reading))).toBe(
      'Steamed whole fish Main ingredients: whole fish (grey-silver skin); chicken (black skin). Sauce: dark amber soy. Garnish: scallion, fine rings, a small pinch.',
    )
  })

  it('cuts a long answer instead of refusing it, and refuses an unknown category', () => {
    const long = dishReadingSchema.parse({ ...reading, sauce: 'x'.repeat(500), main_ingredients: Array(20).fill({ name: 'n'.repeat(300), color: 'b' }),
      garnish: [{ item: 'i'.repeat(300), shape: 's'.repeat(300), count: 'c'.repeat(300) }] })
    expect(long.sauce).toHaveLength(200)
    expect(long.main_ingredients).toHaveLength(8)
    // Room for the visible features the reading writes into a name (kind, head, skin, cut, count).
    expect(long.main_ingredients[0]?.name).toHaveLength(200)
    expect(long.garnish[0]).toEqual({ item: 'i'.repeat(120), shape: 's'.repeat(120), count: 'c'.repeat(40) })
    expect(dishReadingSchema.safeParse({ ...reading, category: 'dessert' }).success).toBe(false)
  })
})

describe('the dish name the user typed (Owner 2026-11-15)', () => {
  it('is one clean line of at most 60 characters, or nothing', () => {
    expect(userDishName({ dish_name: '  红烧鳝段  ' })).toBe('红烧鳝段')
    expect(userDishName({})).toBe('')
    expect(userDishName({ dish_name: '   ' })).toBe('')
    expect(userDishName({ dish_name: 'braised\neel\r\n\tsegments\u2028' })).toBe('braised eel segments')
    expect(userDishName({ dish_name: 'x'.repeat(200) })).toHaveLength(DISH_NAME_MAX)
  })
})
