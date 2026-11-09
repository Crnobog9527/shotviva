import { describe, expect, it } from 'vitest'

import { toJobResponse } from '../partner/partner-views'
import { generateBodySchema } from './generation-request'
import { jobRowSchema } from './job-schema'
import { toJobView } from './job-view'

const key = 'style-refs/qa/private-canary.webp'
const inputs = { aspect_ratio: '1:1', style_ref_keys: [key], kept_inputs: ['outputs/owner/job/input-1.webp'] }
const row = {
  id: 'job', user_id: 'owner', module: 'image', template_id: 'qa', inputs,
  provider: 'provider/model', source: 'web', idempotency_key: null, status: 'succeeded',
  credit_pool: 'paid', visibility: 'private', credits_cost: 2, output_key: 'outputs/owner/job.webp',
  error_code: null, created_at: '2026-11-10T00:00:00Z', finished_at: '2026-11-10T00:01:00Z',
}

describe('private template references', () => {
  it('keeps audit keys out of serialized jobs, while preserving the owner’s reusable photos', () => {
    const job = jobRowSchema.parse(row)
    expect(job.inputs).toEqual({ aspect_ratio: '1:1', kept_inputs: inputs.kept_inputs })
    expect(JSON.stringify(job)).not.toContain(key)
    expect(row.inputs.style_ref_keys).toEqual([key])
  })

  it('also excludes private inputs from both HTTP contracts even if given a raw job', () => {
    const job = { ...jobRowSchema.parse(row), inputs }
    for (const response of [toJobView(job), toJobResponse(job, 'https://example.org/result')]) {
      expect(response).not.toHaveProperty('inputs')
      expect(JSON.stringify(response)).not.toMatch(/style_ref_keys|style-refs\//)
    }
  })

  it('does not accept caller-supplied reference keys or an opt-out on web requests', () => {
    const body = generateBodySchema.parse({ template_id: 'qa', inputs, omit_style_refs: true })
    expect(body.inputs).toEqual({ aspect_ratio: '1:1' })
    expect(body).not.toHaveProperty('omit_style_refs')
  })
})
