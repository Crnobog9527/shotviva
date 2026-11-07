import type { LegalSection } from '@/core/content'

import { emailLink, entity } from './shared'

// Privacy Policy: phone sign-in for mainland China (ARCHITECTURE §7, T63). English only; the
// Chinese pages link to the same policy. On the lawyer review list (PIPL: purpose, the SMS
// processor, cross-border transfer, separate consent).

export const privacyPhoneSections: readonly [LegalSection, ...LegalSection[]] = [
  {
    id: 'phone-numbers',
    heading: 'Phone numbers and text messages (mainland China)',
    blocks: [
      `On the Chinese version of ${entity.site} you can sign up and sign in with a mainland China (+86) mobile number instead of an email address. We send a six-digit code by text message, and entering it signs you in. There is no password.`,
      {
        list: [
          'What we keep: your phone number, stored with your account by our sign-in provider (Supabase). We use it only to sign you in, to show it to you on your account page (masked, for example 138****5678), to let our support staff find your account when you ask for help, and to prevent abuse. We do not use it for marketing, and we do not call you or send you anything other than sign-in codes.',
          'The code: it works for five minutes and only once. We do not keep it, and it never appears in our logs, error reports or analytics.',
          'Limits: to stop abuse, each number can receive one code a minute and five a day, and each network twenty a day. For this we keep a record of each code request for two days: a one-way hash of the phone number (not the number itself), the IP address the request came from, and the time.',
          'Our SMS provider: the phone number and the code are passed to an SMS service provider, which delivers the text message in mainland China. It receives only the number and the code, and only to deliver the message.',
          'A phone account may have no email address. When you buy something, the payment provider asks for an email address on its own checkout page to send your receipt. Replies to your support messages appear in Help & feedback on your account page.',
        ],
      },
      'Transfer outside mainland China: your account, including your phone number, is stored and processed in the United States (see "Where information is processed"). Before we send a code, we ask you to agree, in a separate box, to this policy and to this transfer of your personal information outside mainland China. If you do not agree, use email sign-in instead.',
      [
        'You can see your number on your account page, and you can delete your account at any time, which deletes your phone number too. To ask for a copy, a correction or anything else about your information, or to withdraw your consent, email ',
        emailLink,
        '.',
      ],
    ],
  },
]
