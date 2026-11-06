// In-site support tickets (ARCHITECTURE §10 「站内工单」, T27). Server side: service-role writes,
// RLS reads for the author, admin reads and the refund panel. Client components use
// '@/core/support/ui' and '@/core/support/rules'; the admin pages '@/core/support/admin-ui'.
export { BODY_MAX, TICKET_STATUSES, TICKET_TYPES, type TicketStatus, type TicketType } from './rules'
export type {
  AdminPayment,
  AdminTicket,
  AdminTicketRow,
  Page,
  PaymentOption,
  RefundEligibility,
  TicketSummary,
  TicketThread,
  WorkOption,
} from './types'
export { adminListFilterSchema, type AdminListFilter } from './schema'
export { formatMoney, paymentChoices, workChoices } from './choices'
export { addTicketMessage, createTicket, markTicketSeen } from './tickets'
export { hasUnreadReply, listMyTickets, listPaymentOptions, listWorkOptions, loadMyThread } from './reads'
export { decideRefund, listAdminTickets, loadAdminTicket, openTicketCount, replyTicket } from './admin'
export { SupportTabBadge } from './tab-badge'
