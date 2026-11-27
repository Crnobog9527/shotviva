// The text one on/off switch card needs (setting-switch-card.tsx). Admin copy is Chinese only.
//
// Cards written to the unified layout give `summary`: one line of purpose and what on and off do.
// `body` is then the long explanation, folded under 详细说明. A card without `summary` shows
// `body` in full, as before.
export type SwitchCopy = {
  title: string
  key: string
  body: string
  summary?: SwitchSummary
  state: { on: string; off: string }
  stateLabel: string
  lastChanged: (who: string, at: string) => string
  someone: string
  neverChanged: string
  turnOn: string
  turnOff: string
  saving: string
  saved: { on: string; off: string }
  dialog: {
    on: { title: string; body: string; confirm: string }
    off: { title: string; body: string; confirm: string }
    cancel: string
  }
}

export type SwitchSummary = {
  // One line: what the switch is for.
  purpose: string
  whenOn: string
  whenOff: string
  // The switches the Owner turns off first when something goes wrong.
  emergency?: boolean
}

// Words every unified card shares.
export const SWITCH_CARD_COPY = {
  whenOn: '开着',
  whenOff: '关着',
  emergency: '紧急开关',
  details: '详细说明',
  settingKey: '设置名',
} as const
