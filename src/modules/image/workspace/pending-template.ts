import type { CatalogueTemplate } from '../catalogue/catalogue-template'

// The template the visitor has just pressed Generate on, kept for the move to its workspace
// page: that page's pending view (workspace-pending.tsx) draws the same head the server will
// send (thumbnail, name, "category · what it does"), so nothing moves when the server's page
// takes over. One slot is enough: it is written on the click and read by the page it leads to.
let remembered: CatalogueTemplate | null = null

export function rememberTemplate(template: CatalogueTemplate): void {
  remembered = template
}

export function recallTemplate(templateId: string): CatalogueTemplate | null {
  return remembered?.id === templateId ? remembered : null
}
