import type { Translate } from '@/core/translate'

export function formLabels(t: Translate, submit: string) {
  return { submit: t(submit), invalid: t('invalid'), failed: t('failed'), saved: t('saved') }
}
