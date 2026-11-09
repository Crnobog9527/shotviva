import type { HelpActions } from '@/core/support/ui'
import { signOutAction } from '@/app/auth/actions'
import { addMessageAction, createTicketAction, loadMyTicketsPage, loadTicketThread, loadWorkChoices } from './help-actions'
import { disconnectGraylumAction } from './partner-actions'
import { cancelWaffoSubscriptionAction, manageSubscriptionAction } from './subscription-actions'

export const actions = {
  manageSubscription: manageSubscriptionAction,
  cancelWaffoSubscription: cancelWaffoSubscriptionAction,
  disconnectGraylum: disconnectGraylumAction,
  signOut: signOutAction,
}

export const helpActions: HelpActions = {
  create: createTicketAction,
  addMessage: addMessageAction,
  loadTickets: loadMyTicketsPage,
  loadThread: loadTicketThread,
  loadWorks: loadWorkChoices,
}
