// The app shell (DESIGN §8): tab bar, tab-root and flow headers, bottom action bar, balance.
// Pages in app/(app) assemble these; modules pass their own pieces in as slots.
export { ActionBar, ActionNotice } from './action-bar'
export { AppFrame, AppPage } from './app-frame'
export { BalanceChip } from './balance-chip'
export { balanceChipLabel, balanceSentence } from './balance-copy'
export { FlowNav } from './flow-nav'
export { adminEntryFor, type AdminEntry } from './admin-entry'
export { TabBar, type TabItem } from './tab-bar'
export { TabRootHeader } from './tab-root-header'
