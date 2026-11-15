import { z } from 'zod'

import { DISH_CATEGORIES } from '../templates/food-flow'

// The vessel library of the food templates' tableware toggle (ARCHITECTURE §5.1c「器皿图库」):
// empty serving pieces sorted by dish shape, each with a one-line generic shape description.
// Private table dishware_library (1562), private bucket under dishware/. No `server-only`: the
// admin page shares these shapes.

export const DISHWARE_LABEL_MAX = 40
export const DISHWARE_SHAPE_MAX = 200
// The stored image's long edge: enough for the model to see outline, rim and glaze.
export const DISHWARE_EDGE = 1024

export type DishwareItem = {
  id: string
  label: string
  category: (typeof DISH_CATEGORIES)[number]
  shape: string
  imageKey: string
  width: number
  height: number
  isActive: boolean
}

export const dishwareKey = (id: string, hash: string) => `dishware/${id}-${hash}.webp`
export const DISHWARE_KEY = /^dishware\/[0-9a-f-]{36}-[0-9a-f]{16}\.webp$/

export const dishwareRowSchema = z.object({
  id: z.uuid(),
  label: z.string(),
  category: z.enum(DISH_CATEGORIES),
  shape: z.string(),
  image_key: z.string().regex(DISHWARE_KEY),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  is_active: z.boolean(),
})

export const toDishwareItem = (row: z.infer<typeof dishwareRowSchema>): DishwareItem => ({
  id: row.id, label: row.label, category: row.category, shape: row.shape,
  imageKey: row.image_key, width: row.width, height: row.height, isActive: row.is_active,
})

export const DISHWARE_COLUMNS = 'id, label, category, shape, image_key, width, height, is_active'

// What the admin save takes (the image comes from a finished upload or the import script).
export const dishwareInputSchema = z.strictObject({
  id: z.uuid(),
  label: z.string().trim().min(1).max(DISHWARE_LABEL_MAX),
  category: z.enum(DISH_CATEGORIES),
  shape: z.string().trim().min(1).max(DISHWARE_SHAPE_MAX),
  imageKey: z.string().regex(DISHWARE_KEY),
  width: z.int().positive(),
  height: z.int().positive(),
  isActive: z.boolean(),
})
export type DishwareInput = z.infer<typeof dishwareInputSchema>
