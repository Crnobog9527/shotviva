// Dispute evidence (ARCHITECTURE §6.3 「拒付申诉证据」, T82): the webhook side (openDispute, wired
// through payment-issues.ts) and the Owner's admin actions.
export { alertDisputeDueSoon, disputeDueSoonText, disputeOpenedText, type DisputeAlertFacts } from './alerts'
export { disputeAdminPath, type DisputeEvidenceConfig } from './config'
export { buildEvidence, type EvidenceContext, type EvidenceProduct, type EvidenceText } from './evidence'
export { evidenceFactsSchema, type EvidenceFacts } from './facts'
export { formatAmount, formatDeadline, isRespondable, REASON_ZH, STATUS_ZH } from './labels'
export { FILE_FIELDS, TEXT_FIELDS, toLive, type FileField, type LiveDispute, type TextField } from './live'
export {
  attachEvidenceFile,
  DISPUTE_ERRORS,
  loadDisputeRow,
  loadLiveDispute,
  saveSupplement,
  submitEvidence,
  type EvidenceFile,
  type ManageDeps,
} from './manage'
export { disputeRowSchema, type DisputeRow } from './row'
