import { EDIT_TEMPLATE_ID } from '@/core/templates/edit-params'
import type { CreditsCost } from '@/core/templates/pricing'

import { startJob } from '../generation/job-store'
import type { EditDraft, EditSource } from './edit-source'

// Queues one edit (ARCHITECTURE §5.2) in the app-wide generation store, so closing the viewer or
// leaving Photos does not stop it. name: what the new photo is called while it develops.
export function startEdit(source: EditSource, draft: EditDraft, creditsCost: CreditsCost, concurrency: number, name: string): string {
  return startJob(
    {
      templateId: EDIT_TEMPLATE_ID,
      templateName: name,
      resolution: draft.resolution,
      aspect: draft.aspect,
      credits: creditsCost[draft.resolution],
      inputKey: null,
      previewUrl: source.fileUrl,
      body: { expected_credits: creditsCost[draft.resolution], source_job_id: source.id, instruction: draft.text, resolution: draft.resolution, aspect_ratio: draft.aspect },
    },
    concurrency,
  )
}
