import type { Page, ShownThread, TicketSummary } from '../types'
import type { Choice, FormAction, FormState } from './form-state'

// The server actions the Help dialog runs (app/(app)/account/help-actions.ts); core never
// imports app/, so the account page passes them in.
export type HelpActions = {
  create: FormAction
  addMessage(ticketId: string, state: FormState, data: FormData): Promise<FormState>
  loadTickets(cursor: string | null): Promise<Page<TicketSummary>>
  loadThread(ticketId: string): Promise<ShownThread | null>
  // `jobId`: a work to include even when it is not among the latest (T78).
  loadWorks(jobId?: string | null): Promise<Choice[]>
}
