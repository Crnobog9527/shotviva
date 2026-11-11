import { z } from 'zod'
import { PRODUCT_IDS } from './define-site'

const slug = z.string().regex(/^[a-z][a-z0-9]{0,47}$/)

export const productIdSchema = z.union([
  z.enum(PRODUCT_IDS),
  z.templateLiteral(['pack_', slug]),
  z.templateLiteral([slug, '_', z.enum(['monthly', 'yearly'])]),
])
