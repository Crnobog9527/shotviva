// The text one on/off switch card needs (setting-switch-card.tsx). Admin copy is Chinese only.
export type SwitchCopy = {
  title: string
  key: string
  body: string
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
