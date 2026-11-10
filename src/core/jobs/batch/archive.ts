import 'server-only'

import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { MAX_BATCH_SIZE } from '../../billing'
import { AppError } from '../../errors'
import { outputKeyFor } from '../../storage'

const entry = z.object({
  id: z.uuid(), output_key: z.string(), position: z.coerce.number().int().min(1).max(MAX_BATCH_SIZE),
  photo: z.string(), template: z.string(),
})

function safePart(name: string) {
  const clean = name.normalize('NFKC').replace(/[^\p{L}\p{N} -]+/gu, '_').trim()
  return [...clean].slice(0, 28).join('') || '_'
}

export function archiveFilename(photo: string, template: string, position: number) {
  return `${safePart(photo.replace(/\.[a-z0-9]{1,5}$/i, ''))}_${safePart(template)}_${position}.png`
}

export async function batchArchive(db: SupabaseClient, userId: string, batchId: string) {
  const { data, error } = await db.from('generation_jobs')
    .select('id,output_key,position:inputs->>batch_position,photo:inputs->>batch_photo_name,template:inputs->>batch_template_name')
    .eq('user_id', userId).eq('batch_id', batchId).eq('credit_pool', 'paid').eq('status', 'succeeded').is('deleted_at', null)
    .limit(MAX_BATCH_SIZE)
  if (error) throw new AppError('INTERNAL', 'Batch lookup failed', { cause: error })
  if (!data.length) throw new AppError('NOT_FOUND', 'No completed works in this batch')
  const rows = z.array(entry).parse(data).sort((a, b) => a.position - b.position)
  const files = rows.map(r => {
    if (r.output_key !== outputKeyFor(userId, r.id)) throw new AppError('INTERNAL', 'Invalid batch output')
    return { jobId: r.id, key: r.output_key, name: archiveFilename(r.photo, r.template, r.position) }
  })
  const revision = createHash('sha256').update(JSON.stringify(files)).digest('hex')
  return { files, key: `inputs/${userId}/batch-exports/${batchId}/${revision}.zip`, name: `shotviva-${batchId}.zip` }
}
