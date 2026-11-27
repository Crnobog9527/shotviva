import { STATUS } from './copy'

/** The pause hold (migration 2028): on_hold while the org's affiliate account is paused. Not a risk flag; an admin cannot release it. */
export const PAUSED_HOLD = '企业联盟暂停期间冻结'
/** Risk flags plus the pause hold. */
export const commissionMarks = (r: { flags: string[]; paused_hold: boolean }) =>
  [...r.flags.map((s) => STATUS[s] ?? s), ...(r.paused_hold ? [PAUSED_HOLD] : [])]
