import type { LegalSection } from '@/core/content'

import { entity } from './shared'

// Privacy Policy, part 2: who we share with, analytics without cookies, and the Graylum
// connection (ARCHITECTURE §14, §16, TASKS T19 provider list).

const providers = [
  'Supabase: database and sign-in (accounts, credit records, works and orders).',
  'Cloudflare R2: storage for uploaded photos, created images and Wishlist reference images.',
  'OpenAI: creates images. We send it your photo, the template instructions and the text you entered. OpenAI processes this data under its API terms.',
  'Stripe and Link: payments, subscriptions and billing portals. For card purchases where Link is the merchant of record, Link also receives your purchase details as the seller.',
  'Waffo: backup payment provider for one-time payments.',
  'PostHog (United States): product analytics, without cookies.',
  'Sentry: error reports, with email addresses and access tokens removed before they are sent.',
  'Resend: delivers account emails such as email confirmation and password reset.',
  'Vercel: hosts the website and runs our servers.',
  'hCaptcha: bot protection on sign-up, sign-in and password reset. It processes device and interaction data under hCaptcha’s own privacy policy.',
  'Google: sign-in, if you choose "Continue with Google".',
] as const

export const privacyShareSections: readonly [LegalSection, ...LegalSection[]] = [
  {
    id: 'share',
    heading: 'Who we share information with',
    blocks: [
      'We share personal information only with service providers that help us run the Service, and only what each one needs for its job:',
      { list: providers },
      'We may also share information if the law requires it, to protect people’s safety or our rights, or as part of a merger, sale or reorganization of our business, in which case this policy continues to apply to it.',
    ],
  },
  {
    id: 'analytics',
    heading: 'Analytics, cookies and error reports',
    blocks: [
      'We use PostHog to understand how people use the Service, such as which pages are visited, which buttons are clicked, how fast pages load, and which steps (sign-up, upload, image creation, checkout) succeed or fail. PostHog is set up so that it does not set cookies or store anything in your browser, so it does not recognize you from one visit to the next unless you sign in. Analytics data is sent through our own domain.',
      'When you are signed in, analytics events are linked to your account ID, not to your email address. Events never include your email address, the text you entered, your photos, image links or template instructions. We do not record your screen or sessions.',
      'We do not use advertising cookies, tracking pixels or cross-site tracking, which is why we do not show a cookie banner. We use cookies only where they are needed to keep you signed in and, when you pick a language with the language switch, to remember that choice (a cookie named NEXT_LOCALE that holds only "en" or "zh", kept for one year and used for nothing else). Pages run by others, such as Stripe, Link or Waffo checkout, Google sign-in and the hCaptcha check, may set their own cookies under their own policies.',
      'Because we do not sell or share personal information for targeted advertising, there is nothing to opt out of. We still treat a Global Privacy Control signal from your browser as a valid opt-out request.',
      'When something breaks, Sentry receives an error report with technical details about the error and your browser, with email addresses and access tokens removed.',
    ],
  },
  {
    id: 'graylum',
    heading: 'Connecting Graylum',
    blocks: [
      `Graylum is another service run by our company. Connecting it is optional. If you connect your ${entity.site} account to Graylum:`,
      {
        list: [
          `${entity.site} shares with Graylum: your ${entity.site} account ID, your display name, how many paid and free credits you have left, and the end date of your membership period, if any.`,
          `Graylum sends ${entity.site} what is needed to create each image you ask for there: the template, the text you entered and, if you add one, a photo. ${entity.site} sends back a link to the created image.`,
          `Images created through Graylum are stored as your works on ${entity.site}, under this policy.`,
          `${entity.site} does not receive your Graylum password or Graylum sign-in tokens.`,
        ],
      },
      'You can disconnect Graylum at any time from your account page. After that, Graylum can no longer use your account. What Graylum does with information on its side is covered by Graylum’s own privacy policy.',
    ],
  },
]
