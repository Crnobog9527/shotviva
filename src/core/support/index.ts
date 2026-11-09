// In-site support tickets (ARCHITECTURE §10 「站内工单」, T27). Server side: service-role writes,
// RLS reads for the author, admin reads and the refund panel. Client components use
// '@/core/support/ui' and '@/core/support/rules'; the admin pages '@/core/support/admin-ui'.
export { BODY_MAX, TICKET_IMAGE_MAX_BYTES, TICKET_IMAGES_MAX, TICKET_STATUSES, TICKET_TYPES, type TicketStatus, type TicketType } from './rules'
export type {
  AdminPayment,
  AdminTicket,
  AdminTicketRow,
  Page,
  ShownAdminTicket,
  ShownMessage,
  ShownThread,
  TicketImage,
  PaymentOption,
  RefundEligibility,
  TicketSummary,
  TicketThread,
  WorkOption,
} from './types'
export { adminListFilterSchema, imageKeysSchema, type AdminListFilter } from './schema'
export { formatMoney, paymentChoices, workChoices } from './choices'
export { addTicketMessage, createTicket, markTicketSeen, type NewTicketImages } from './tickets'
export { showMessages, withTicketImages, type ImageTarget, type TicketImageRow } from './images'
export { PICKER_LIMIT, hasUnreadReply, listMyTickets, listPaymentOptions, listWorkOptions, loadMyThread } from './reads'
export { decideRefund, listAdminTickets, loadAdminTicket, openTicketCount, replyTicket, ticketAuthor } from './admin'
export { ReplyTime } from './reply-time'
export { SupportTabBadge } from './tab-badge'
export { formError, type Choice, type FormState } from './ui/form-state'
