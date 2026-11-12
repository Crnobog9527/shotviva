// The account page's way in. Kept apart from the sign-in forms' index (../index.ts) so a page that
// only needs this panel does not bundle the log-in and sign-up forms with it (the account page
// carried ~10 KB of them, 2026-11-12).
export { DeleteAccountPanel } from './delete-account-panel'
