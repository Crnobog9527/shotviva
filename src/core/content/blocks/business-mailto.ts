// The "For business" Contact us link (DESIGN §6.9 item 8): a mailto with the subject and a body
// of prompts filled in, so the Owner can filter inquiries by subject. Spaces encode as %20, not
// "+", which mail apps would show literally.
export function businessMailto(email: string, subject: string, prompts: readonly string[]): string {
  const body = prompts.map((prompt) => `${prompt}\n`).join('')
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}
