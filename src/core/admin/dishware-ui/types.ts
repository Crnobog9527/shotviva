import type { ActionResult, ActionValue } from '@/core/admin/templates/types'
import type { DishwareInput, DishwareItem } from '@/core/dishware/types'

export type StagedUpload = { id: string; uploadId: string; putUrl: string; headers: Record<string, string> }
export type FinishedUpload = { id: string; imageKey: string; width: number; height: number }

export type DishwareActions = {
  save(input: DishwareInput): Promise<ActionResult>
  remove(id: string): Promise<ActionResult>
  stage(input: { contentType: string; size: number }): Promise<ActionValue<StagedUpload>>
  finish(input: { id: string; uploadId: string }): Promise<ActionValue<FinishedUpload>>
}

// An item with a short-lived preview address, signed when the page renders.
export type ShownDishware = DishwareItem & { previewUrl: string }
