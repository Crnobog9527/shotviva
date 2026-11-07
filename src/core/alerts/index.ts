// Owner business alerts in plain Chinese, sent to the Feishu group bot (ARCHITECTURE §16.4, T72).
// Server only. Sentry (core/analytics captureAlert) stays the developers' channel.
export type { AlertChannel, Clawback, Money, OwnerAlert, OwnerAlertKind, PaymentFailedAlert, PaymentStep } from './alert-kinds'
export { noteGenerationFailure, notifyOwner } from './notify'
