import { describe, expect, it } from 'vitest'

import { dishReadingSchema, dishText } from './reading'

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
    const long = dishReadingSchema.parse({ ...reading, sauce: 'x'.repeat(500), main_ingredients: Array(20).fill({ name: 'a', color: 'b' }) })
    expect(long.sauce).toHaveLength(200)
    expect(long.main_ingredients).toHaveLength(8)
    expect(dishReadingSchema.safeParse({ ...reading, category: 'dessert' }).success).toBe(false)
  })
})
