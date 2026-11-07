import { z } from 'zod'

// Saved templates (ARCHITECTURE §5.1b, T83). The cap is enforced by the database trigger
// (0741); this copy is for the message and the tests.
export const FAVORITES_MAX = 200

// The templates.id shape (its table check), so a bad path segment never reaches the database.
export const favoriteTemplateIdSchema = z
  .string()
  .max(64)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
