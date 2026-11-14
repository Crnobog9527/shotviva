// Business inquiries from the pricing page (ARCHITECTURE §10.c, T86). Server side: the form's
// two actions and the admin reads and writes. The dialog itself is '@/core/inquiries/ui'.
import 'server-only'

export { handleInquirySubmit, inquiryPrefill, type InquiryPrefill } from './handle'
export {
  inquiryFilterSchema,
  listAdminInquiries,
  loadAdminInquiry,
  newInquiryCount,
  updateInquiry,
  type AdminInquiry,
  type AdminInquiryRow,
  type InquiryFilter,
} from './admin'
export { exportInquiries, setInquiriesStatus } from './bulk'
export type { SubmitOutcome } from './submit'
export { INQUIRY_STATUSES, type BulkInquirySkip, type InquiryStatus } from './rules'
