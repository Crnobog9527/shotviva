import type {
  InquiryNeed,
  InquiryPlatform,
  InquiryUse,
  MonthlyVolume,
  StartTime,
  TeamSize,
} from '../rules'
import type { SubmitError } from '../submit'
import type { FieldError } from '../validate'

// The inquiry dialog's words, one object per language (site/content/pricing.ts and
// zh/pricing.ts, DESIGN §6.9 item 8). Plain strings only: it crosses from the server page to the
// client.

type TextCopy = { label: string; placeholder?: string; hint?: string }

export type InquiryCopy = {
  title: string
  description: string
  // Shown after a field's label when it can be left empty.
  optional: string
  // After a multi-choice legend.
  chooseAny: string
  sections: { contact: string; company: string; needs: string }
  fields: {
    name: TextCopy
    email: TextCopy
    jobTitle: TextCopy
    phone: TextCopy
    wechat: TextCopy
    company: TextCopy
    website: TextCopy
    country: TextCopy
    message: TextCopy
    teamSize: string
    platforms: string
    volume: string
    uses: string
    needs: string
    startTime: string
  }
  choices: {
    volume: Record<MonthlyVolume, string>
    uses: Record<InquiryUse, string>
    teamSize: Record<TeamSize, string>
    platforms: Record<InquiryPlatform, string>
    needs: Record<InquiryNeed, string>
    startTime: Record<StartTime, string>
  }
  // The consent line around the Privacy Policy link.
  consent: { before: string; link: { text: string; href: string }; after: string }
  errors: Record<FieldError, string>
  // The send bar's line when fields need fixing, and when the server refused.
  checkFields: string
  failed: Record<SubmitError, string>
  submit: string
  submitting: string
  success: { title: string; body: string; close: string }
}
