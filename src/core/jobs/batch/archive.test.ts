import { describe, expect, it } from 'vitest'

import { batchArchive } from './archive'

const USER = '11111111-1111-4111-8111-111111111111'
const BATCH = '33333333-3333-4333-8333-333333333333'
const id = (n: number) => `00000000-0000-4000-8000-00000000000${n}`

// The one query batchArchive makes, answered with these rows; it records the columns asked for.
function db(rows: Record<string, unknown>[]) {
  const seen = { select: '' }
  const chain = {
    select(columns: string) { seen.select = columns; return chain },
    eq: () => chain,
    is: () => chain,
    limit: () => Promise.resolve({ data: rows, error: null }),
  }
  return { client: { from: () => chain } as never, seen }
}

const row = (n: number, background: string | null) => ({
  id: id(n), output_key: `outputs/${USER}/${id(n)}.png`, position: String(n), photo: `IMG_${n}.jpg`, template: 'Main image', background,
})

describe('batch ZIP with cut-outs (白底 / 透明底)', () => {
  const rows = [row(2, 'transparent'), row(1, null), row(3, 'opaque')]

  it('白底 (the default): cut-outs go in as their staged white JPEG, the rest as originals', async () => {
    const { client, seen } = db(rows)
    const archive = await batchArchive(client, USER, BATCH)
    expect(seen.select).toContain('background:inputs->>background')
    expect(archive.files.map((file) => [file.key, file.name])).toEqual([
      [`outputs/${USER}/${id(1)}.png`, 'IMG_1_Main image_1.png'],
      [`inputs/${USER}/downloads/${id(2)}-white.jpg`, 'IMG_2_Main image_2.jpg'],
      [`outputs/${USER}/${id(3)}.png`, 'IMG_3_Main image_3.png'],
    ])
    expect(archive.white).toEqual([{ source: `outputs/${USER}/${id(2)}.png`, key: `inputs/${USER}/downloads/${id(2)}-white.jpg` }])
  })

  it('透明底: every file is its original PNG, and the ZIP is a different object', async () => {
    const white = await batchArchive(db(rows).client, USER, BATCH, 'white')
    const clear = await batchArchive(db(rows).client, USER, BATCH, 'transparent')
    expect(clear.files.every((file) => file.key.startsWith('outputs/') && file.name.endsWith('.png'))).toBe(true)
    expect(clear.white).toEqual([])
    expect(clear.key).not.toBe(white.key)
  })
})
