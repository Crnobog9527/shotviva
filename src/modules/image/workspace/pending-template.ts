import type { CatalogueTemplate } from '../catalogue/catalogue-template'

// The template the visitor has just pressed Generate on, kept for the move to its workspace
// page: that page's pending view (workspace-pending.tsx) draws the same head the server will
// send (thumbnail, name, "category · what it does"), so nothing moves when the server's page
// takes over. The shared creation draft writes it on start (use-workspace-draft.ts), so every
// dialog built on that draft hands it over. One slot is enough: it is written on the click and
// read by the page it leads to.
let remembered: CatalogueTemplate | null = null

export function rememberTemplate(template: CatalogueTemplate): void {
  remembered = template
}

export function recallTemplate(templateId: string): CatalogueTemplate | null {
  return remembered?.id === templateId ? remembered : null
}

// The template whose head the pending view has on screen right now. The server's page mounts
// its own head while that one is still there: it then takes over as it is, without the entry
// fade a head normally gets (measured on the test site: without this the head went to opacity 0
// and faded up again about a second after the click).
let headOnScreen: string | null = null

// For the pending view's effect: marks the head as shown, and returns the cleanup that unmarks it.
export function showPendingHead(templateId: string): () => void {
  headOnScreen = templateId
  return () => {
    if (headOnScreen === templateId) headOnScreen = null
  }
}

export function pendingHeadShown(templateId: string): boolean {
  return headOnScreen === templateId
}
