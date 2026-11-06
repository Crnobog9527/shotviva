import type { OutputAspect, Resolution } from '@/core/templates/output-options'

// The finished photo being edited, as the panel shows it. Plain data from the server page.
export type EditSource = {
  id: string
  // The download route: watermarked for a free work, like everywhere else it is shown.
  fileUrl: string
  name: string
  aspect: OutputAspect
  resolution: Resolution
}

export type EditDraft = { text: string; resolution: Resolution }
