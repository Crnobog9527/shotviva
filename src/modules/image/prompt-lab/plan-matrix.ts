import { z } from 'zod'

const ids = z.array(z.uuid()).min(1).max(12).refine((values) => new Set(values).size === values.length)

const selection = z.object({
  photoIds: ids,
  versionIds: ids,
}).refine(({ photoIds, versionIds }) => photoIds.length * versionIds.length <= 12)

// The server supplies the model's per-cell estimate. Budget reservation is a DB operation.
export function planMatrix(input: unknown, estimatePerCellUsd: number) {
  const { photoIds, versionIds } = selection.parse(input)
  const estimate = z.number().nonnegative().parse(estimatePerCellUsd)
  const cells = photoIds.flatMap((photoId) => versionIds.map((versionId) => ({ photoId, versionId })))
  const estimateUsd = Math.round(estimate * cells.length * 1e6) / 1e6
  return { cells, estimateUsd }
}
