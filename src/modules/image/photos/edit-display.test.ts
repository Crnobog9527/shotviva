import { describe, expect, it } from 'vitest'

import type { Job } from '@/core/jobs'

import { editDisplay, editOriginal } from './edit-display'

const base: Job = {
  id: 'src',
  userId: 'u',
  module: 'image',
  templateId: 'pure-white',
  parentJobId: null,
  inputs: { aspect_ratio: '4:5', resolution: '1k' },
  provider: null,
  source: 'web',
  idempotencyKey: null,
  status: 'succeeded',
  creditPool: 'free',
  visibility: 'public',
  creditsCost: 2,
  outputKey: 'outputs/u/src.png',
  errorCode: null,
  createdAt: new Date('2026-11-06T10:00:00Z'),
  finishedAt: new Date('2026-11-06T10:00:30Z'),
}
const edit: Job = { ...base, id: 'e1', templateId: 'edit', parentJobId: 'src', inputs: { ...base.inputs, instruction: 'Put it on a café chair' } }
const templates = new Map([['pure-white', { name: 'Pure White', cover: null }]])
const names = { fallback: 'Photo', edited: 'Edited photo', titleEdited: (name: string) => `${name} (edit)` }
const url = (id: string) => `/api/files/${id}`

describe('editDisplay', () => {
  it('names an edit after its template source and shows the change', () => {
    const shown = editDisplay(edit, base, templates, names, url)
    expect(shown.item.templateName).toBe('Pure White (edit)')
    expect(shown.source).toMatchObject({ id: 'src', templateName: 'Pure White', fileUrl: '/api/files/src' })
    expect(shown.change).toBe('Put it on a café chair')
  })

  it('falls back to "Edited photo" when the source is gone or is itself an edit', () => {
    expect(editDisplay(edit, null, templates, names, url).item.templateName).toBe('Edited photo')
    expect(editDisplay({ ...edit, id: 'e2', parentJobId: 'e1' }, edit, templates, names, url).item.templateName).toBe('Edited photo')
  })

  it('leaves a template photo as it is', () => {
    expect(editDisplay(base, null, templates, names, url)).toMatchObject({ item: { templateName: 'Pure White' }, source: null, change: null })
  })

  it("shows the source as an edit's Original, and the empty tray once it is gone", () => {
    const { source } = editDisplay(edit, base, templates, names, url)
    expect(editOriginal(source)).toEqual({ kind: 'source', url: '/api/files/src' })
    expect(editOriginal(null)).toEqual({ kind: 'deleted' })
  })
})
