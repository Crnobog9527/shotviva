import { describe, expect, it } from 'vitest'

import type { StartInput } from '../generation/job-store'
import { photoNameFor, preflightCells, withPreflight, type PreflightResult } from './preflight'

const inputs = { copy: {}, resolution: '1k', aspect_ratio: '4:5' }
const input = (template: string, key: string | null): StartInput => ({
  templateId: template, templateName: template, resolution: '1k', aspect: '4:5', credits: 2, inputKey: key,
  body: { expected_credits: 2, template_id: template, input_key: key, inputs },
})

describe('batch preflight cells', () => {
  it('names each cell and sends the very inputs the cell will be submitted with', () => {
    const cells = preflightCells([input('a', 'k1'), input('a', 'k2')], [photoNameFor('IMG_1.jpg', 0), photoNameFor(undefined, 1)])
    expect(cells).toEqual([
      { template_id: 'a', input_key: 'k1', inputs, expected_credits: 2, photo_name: 'IMG_1.jpg' },
      { template_id: 'a', input_key: 'k2', inputs, expected_credits: 2, photo_name: 'photo-2' },
    ])
  })

  it('does not preflight a cell without a photo', () => {
    expect(preflightCells([input('a', null), input('a', 'k')], ['x', 'y'])).toBeNull()
  })

  it('attaches the batch, the signed cell and the server price to each job in order', () => {
    const cell = (position: number) => ({ position, photo_name: `p${position}`, template_name: 'A', signature: 'f'.repeat(64) })
    const result: PreflightResult = { batch_id: 'B', batch_size: 2, batch_templates: 1, total_credits: 7, cells: [{ expected_credits: 3, batch_cell: cell(1) }, { expected_credits: 4, batch_cell: cell(2) }] }
    const [first, second] = withPreflight([input('a', 'k1'), input('a', 'k2')], result)
    expect(first).toMatchObject({ batchId: 'B', credits: 3, body: { batch_id: 'B', batch_templates: 1, expected_credits: 3, batch_cell: cell(1) } })
    expect(second).toMatchObject({ credits: 4, body: { batch_cell: cell(2) } })
  })
})
