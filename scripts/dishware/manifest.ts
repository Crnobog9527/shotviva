import { readFile } from 'node:fs/promises'
import { dirname, resolve, sep } from 'node:path'

import { z } from 'zod'

import { DISHWARE_LABEL_MAX, DISHWARE_SHAPE_MAX } from '../../src/core/dishware/types'
import { DISH_CATEGORIES } from '../../src/core/templates/food-flow'

// The local list `pnpm dishware:import` reads: one entry per vessel, its file next to the list.
// Ids are fixed in the file, so an import repeats itself and the test site keeps the same ids.
export const manifestSchema = z.strictObject({
  items: z.array(z.strictObject({
    id: z.uuid(),
    label: z.string().trim().min(1).max(DISHWARE_LABEL_MAX),
    category: z.enum(DISH_CATEGORIES),
    shape: z.string().trim().min(1).max(DISHWARE_SHAPE_MAX),
    file: z.string().regex(/^[\w./-]+\.(png|jpe?g|webp)$/),
    active: z.boolean().default(true),
  })).min(1),
})
export type Manifest = z.infer<typeof manifestSchema>

// Only from a gitignored .local/ folder, like the template batches; files stay inside its folder.
export async function readManifest(path: string): Promise<{ manifest: Manifest; fileOf: (name: string) => string }> {
  const file = resolve(path)
  if (!file.split(sep).includes('.local')) throw new Error('清单要放在 .local/ 下（不进 git）')
  const manifest = manifestSchema.parse(JSON.parse(await readFile(file, 'utf8')))
  const folder = dirname(file)
  const fileOf = (name: string) => {
    const full = resolve(folder, name)
    if (!full.startsWith(folder + sep)) throw new Error(`图片要放在清单所在的文件夹里：${name}`)
    return full
  }
  return { manifest, fileOf }
}
