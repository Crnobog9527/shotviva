import { SWITCH_CARD_COPY } from './switch-copy'

// The stored setting's name, small and last on a card: for engineers, not the first thing to read.
export function SettingKey({ name }: { name: string }) {
  return (
    <p className="text-xs text-muted-foreground">
      {SWITCH_CARD_COPY.settingKey} <span className="font-mono">{name}</span>
    </p>
  )
}
