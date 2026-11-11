import { describe, expect, it } from 'vitest'

import type { TrackedJob } from '../generation/job-model'
import { photoNumbers, resultGroups } from './result-groups'

const job = (id: string, templateId: string, inputKey: string): TrackedJob => ({
  id, templateId, templateName: templateId.toUpperCase(), resolution: '1k', aspect: '4:5', credits: 2, inputKey, batchSize: 4,
  queuedAt: 0, startedAt: 0, status: 'queued', fileUrl: null, creditPool: null, failure: null, batchId: 'B',
})

// Batch order is template-major, as the grid sends it.
const jobs = [job('1', 'a', 'p1'), job('2', 'a', 'p2'), job('3', 'b', 'p1'), job('4', 'b', 'p2')]

describe('multi-template results', () => {
  it('groups by template, each with its photos in batch order', () => {
    expect(resultGroups(jobs, 'template').map((group) => [group.title, group.templateId, group.jobs.map((member) => member.id)])).toEqual([
      ['A', 'a', ['1', '2']],
      ['B', 'b', ['3', '4']],
    ])
  })

  it('groups by photo, numbered as the grid listed them', () => {
    expect(resultGroups(jobs, 'photo').map((group) => [group.photoIndex, group.jobs.map((member) => member.templateId)])).toEqual([
      [1, ['a', 'b']],
      [2, ['a', 'b']],
    ])
    expect(photoNumbers(jobs).get('4')).toBe(2)
  })
})
