import { describe, expect, it } from 'vitest'

import type { TestRun } from './test-run-row'
import { toTestRunView } from './test-run-view'

const run: TestRun = {
  id: 'r1',
  templateId: 't1',
  kind: 'edit',
  parentId: 'r0',
  photoId: 'p1',
  batchId: 'b1',
  status: 'succeeded',
  resolution: '2k',
  inputs: { instruction: 'beach', edit_scope: 'background', aspect_ratio: '4:5', copy: { dish: 'salmon', n: 3 }, attempt_id: 'x' },
  promptVersion: 4,
  provider: 'b3c1-uuid/gpt-image-2.6',
  costUsd: 0.07,
  estimateUsd: 0.09,
  outputKey: 'admin-tests/outputs/r1.png',
  errorCode: null,
  durationMs: 41_000,
  coverSetAt: '2026-11-08T01:00:00Z',
  createdAt: '2026-11-08T00:00:00Z',
}

describe('toTestRunView', () => {
  it('keeps what the panel shows and leaves the storage key and provider id out', () => {
    const view = toTestRunView(run, 'https://signed')
    expect(view).toMatchObject({ instruction: 'beach', editScope: 'background', aspectRatio: '4:5', model: 'gpt-image-2.6', isCover: true, outputUrl: 'https://signed' })
    expect(view.copy).toEqual({ dish: 'salmon' })
    expect(JSON.stringify(view)).not.toContain('admin-tests/')
    expect(JSON.stringify(view)).not.toContain('b3c1-uuid')
  })
})
