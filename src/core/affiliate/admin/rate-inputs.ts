import { z } from 'zod'
import { categories } from './query'

const percent = z
  .string()
  .regex(/^\d{1,3}(?:\.\d{1,2})?$/)
  .transform((s) => Math.round(Number(s) * 100))
  .pipe(z.number().max(10000))
const optionalRate = z.union([z.literal('').transform(() => null), percent])
export const rateInputs = (form: FormData, optional: boolean) =>
  categories.map((product_kind) => {
    const field = optional ? optionalRate : percent
    return { product_kind, l1_bp: field.parse(form.get(product_kind + '_l1')), l2_bp: field.parse(form.get(product_kind + '_l2')) }
  })
// The settings form: the program rates plus each kind's enterprise level-2 default (migration 1900).
export const settingsRateInputs = (form: FormData) =>
  rateInputs(form, false).map((r) => ({ ...r, org_l2_bp: percent.parse(form.get(r.product_kind + '_org_l2')) }))
