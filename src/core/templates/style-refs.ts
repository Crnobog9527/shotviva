import { z } from 'zod'

export const STYLE_REF_EDGE = 1536
export const MAX_STYLE_REFS = 3
const id = '[a-z0-9]+(?:-[a-z0-9]+)*'
const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'
const keyPattern = new RegExp(`^style-refs/(${id})/${uuid}\\.webp$`)

export function isStyleRefKey(templateId: string, key: string) {
  return keyPattern.exec(key)?.[1] === templateId
}

export const styleRefsSchema = z.array(z.strictObject({
  key: z.string().regex(keyPattern),
  width: z.number().int().min(1).max(STYLE_REF_EDGE),
  height: z.number().int().min(1).max(STYLE_REF_EDGE),
  uploadedAt: z.iso.datetime(),
})).max(MAX_STYLE_REFS).refine(refs => new Set(refs.map(ref => ref.key)).size === refs.length)
export type StyleRef = z.infer<typeof styleRefsSchema>[number]
