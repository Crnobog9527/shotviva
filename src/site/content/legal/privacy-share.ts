import type { LegalSection } from '@/core/content'

import { entity } from './shared'

// Privacy Policy, part 2: who we share with, analytics and cookies (cookies by region, T70),
// error reports, and the Graylum connection (ARCHITECTURE §14, §16, TASKS T19 provider list).

const providers = [
  'Supabase: database and sign-in (accounts, credit records, works and orders).',
  'Cloudflare R2: storage for uploaded photos, created images and Wishlist reference images.',
  'OpenAI: creates images. We send it your photo, the template instructions and the text you entered. OpenAI processes this data under its API terms.',
  'Stripe and Link: payments, subscriptions and billing portals. For card purchases where Link is the merchant of record, Link also receives your purchase details as the seller.',
  'Waffo: backup payment provider for one-time payments.',
  'PostHog (United States): product analytics, described in "Analytics and cookies" below.',
  'Sentry: error reports, with email addresses, phone numbers and access tokens removed before they are sent.',
  'Resend: delivers account emails such as email confirmation and password reset.',
  'Vercel: hosts the website and runs our servers.',
  'hCaptcha: bot protection on sign-up, sign-in and password reset. It processes device and interaction data under hCaptcha’s own privacy policy.',
  'Google: sign-in, if you choose "Continue with Google".',
  'An SMS service provider: delivers sign-in codes by text message to mainland China mobile numbers. It receives the phone number and the code.',
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
    heading: 'Analytics and cookies',
    blocks: [
      'We use PostHog to understand how people use the Service, such as which pages are visited, which buttons are clicked, how fast pages load, and which steps (sign-up, upload, image creation, checkout) succeed or fail. Analytics data is sent through our own domain.',
      'Whether PostHog uses a cookie depends on where you visit from. We tell this from the country of your IP address, which our host provides with each request; we do not keep your IP address for this.',
      {
        list: [
          'Outside the European Union, the European Economic Area, the United Kingdom and Switzerland, PostHog keeps a random identifier in a first-party cookie and in your browser’s local storage, for up to one year, so that visits from the same browser can be seen as one path (for example from the first page you open to sign-up and checkout). A session cookie named sv_analytics_region, holding only "open", tells our pages that this applies.',
          'In the European Union, the European Economic Area, the United Kingdom and Switzerland, we ask first, with a bar at the bottom of the page. Until you choose "Accept", PostHog stores nothing in your browser, so it does not recognize you from one visit to the next unless you sign in. If you choose "Necessary only", it stays that way and we do not ask again. Your answer is kept in your browser’s local storage under sv_analytics_consent, and nothing else is stored with it.',
        ],
      },
      'You can change your choice at any time with "Cookie settings" at the bottom of our pages, wherever you are. Choosing "Necessary only" removes PostHog’s cookie and stored data from your browser. You can also block or delete cookies in your browser’s settings.',
      'When you are signed in, analytics events are linked to your account ID, not to your email address, and what you did in the same browser before signing in is linked to your account too. Events never include your email address, your phone number, the text you entered, your photos, image links or template instructions. We do not record your screen or sessions.',
      'We do not use advertising cookies, tracking pixels or cross-site tracking. Apart from analytics, we use cookies only where they are needed to keep you signed in and, when you pick a language with the language switch, to remember that choice (a cookie named NEXT_LOCALE that holds only "en" or "zh", kept for one year and used for nothing else). Pages run by others, such as Stripe, Link or Waffo checkout, Google sign-in and the hCaptcha check, may set their own cookies under their own policies.',
      'Because we do not sell or share personal information for targeted advertising, there is nothing to opt out of. We still treat a Global Privacy Control signal from your browser as a valid opt-out request.',
    ],
  },
  {
    id: 'errors',
    heading: 'Error reports',
    blocks: [
      'When something breaks, Sentry receives an error report with technical details about the error and your browser, with email addresses, phone numbers and access tokens removed.',
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
