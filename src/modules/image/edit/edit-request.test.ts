import { describe, expect, it } from 'vitest'

import { editBodySchema, toEditRequest } from './edit-request'

const base = { source_job_id: '5c0d9a8e-1111-4222-8333-444455556666', instruction: 'Put it on a beach' }

describe('editBodySchema', () => {
  // T47: the edit panel offers the eight sizes; none sent means the work's own.
  it('takes one of the eight sizes, or none', () => {
    expect(toEditRequest('u', editBodySchema.parse({ ...base, aspect_ratio: '16:9' })).aspect).toBe('16:9')
    expect(toEditRequest('u', editBodySchema.parse(base)).aspect).toBeUndefined()
  })

  it('refuses a size the workspace does not offer', () => {
    expect(editBodySchema.safeParse({ ...base, aspect_ratio: '21:9' }).success).toBe(false)
  })
})
