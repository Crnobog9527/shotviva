import { z } from 'zod'

export { FAVORITES_MAX } from './limits'

// The templates.id shape (its table check), so a bad path segment never reaches the database.
export const favoriteTemplateIdSchema = z
  .string()
  .max(64)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
