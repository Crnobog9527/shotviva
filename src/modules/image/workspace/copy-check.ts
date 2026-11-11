import { checkCopyValue } from '@/core/templates/copy-fields'

import type { CatalogueTemplate } from '../catalogue/catalogue-template'

// Generate stays off while a text field would be refused by the server: a required one left
// empty, a choice not in the list, a number that is not one or is out of range, text over the
// limit (checkCopyValue, the server's own rule). One check for the single form and the Max
// matrix (T107), so neither lets a value through that the other would stop.
export const missingRequiredCopy = (fields: CatalogueTemplate['copyFields'], values: Record<string, string>) =>
  fields.some((field) => {
    try {
      checkCopyValue({ ...field, options: field.options?.map((option) => option.value) }, values[field.key])
      return false
    } catch {
      return true
    }
  })
