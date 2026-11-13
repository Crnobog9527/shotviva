// What a batch did, record by record: the ids it changed and, for the rest, why each was left
// alone. Shared by the server (core/support, core/inquiries) and the result panel.
export type BulkOutcome<Reason extends string> = { done: string[]; skipped: { id: string; reason: Reason }[] }

// Runs `work` for each id, a few at a time, and files each id as done or skipped. `skip` decides
// up front (null = go ahead); a thrown error files the id under `failed` and the rest go on.
export async function eachRecord<Reason extends string>(
  ids: readonly string[],
  skip: (id: string) => Reason | null,
  work: (id: string) => Promise<void>,
  failed: Reason,
  onError?: (id: string, error: unknown) => void,
  width = 5,
): Promise<BulkOutcome<Reason>> {
  const outcome: BulkOutcome<Reason> = { done: [], skipped: [] }
  const queue = [...new Set(ids)]
  const results = new Map<string, Reason | null>()
  for (let start = 0; start < queue.length; start += width) {
    await Promise.all(
      queue.slice(start, start + width).map(async (id) => {
        const reason = skip(id)
        if (reason) return void results.set(id, reason)
        try {
          await work(id)
          results.set(id, null)
        } catch (error) {
          onError?.(id, error)
          results.set(id, failed)
        }
      }),
    )
  }
  // Report in the order the admin ticked them.
  for (const id of queue) {
    const reason = results.get(id)
    if (reason) outcome.skipped.push({ id, reason })
    else outcome.done.push(id)
  }
  return outcome
}
