import type { Page, TicketSummary, TicketThread } from '../types'
import type { Choice, FormAction, FormState } from './form-state'

// The server actions the Help dialog runs (app/(app)/account/help-actions.ts); core never
// imports app/, so the account page passes them in.
export type HelpActions = {
  create: FormAction
  addMessage(ticketId: string, state: FormState, data: FormData): Promise<FormState>
  loadTickets(cursor: string | null): Promise<Page<TicketSummary>>
  loadThread(ticketId: string): Promise<TicketThread | null>
  loadWorks(): Promise<Choice[]>
}
