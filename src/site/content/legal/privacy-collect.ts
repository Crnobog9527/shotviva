import type { LegalSection } from '@/core/content'

import { entity } from './shared'

// Privacy Policy, part 1: what we collect and why (ARCHITECTURE §7, §8.2, §15, §16).

export const privacyCollectSections: readonly [LegalSection, ...LegalSection[]] = [
  {
    id: 'collect',
    heading: 'What we collect',
    blocks: [
      'Information you give us:',
      {
        list: [
          'Account details: your email address and password (stored only in scrambled, hashed form by our sign-in provider), and a display name. If you sign in with Google, we receive your name, email address and profile picture from Google.',
          'Photos you upload. Before a photo leaves your device, your browser shrinks it and saves it again, which removes hidden photo data such as camera details and GPS location. If your browser cannot do this, the original file is uploaded and we shrink it on our servers.',
          'Text you enter for a template, such as a title, a price or a note about what to change.',
          'The images the Service creates for you (your works), and whether each one is public or private.',
          'Template requests: the description and reference images you post on the Wishlist, and your votes.',
          'Messages you send us, through Help & feedback on your account page or by email, for example for support or refunds, and our replies.',
        ],
      },
      'Information from purchases:',
      {
        list: [
          'What you bought, the price, the date, the payment provider and the payment method type (for example card or Alipay), your subscription status, and a record of every credit added to or used from your account.',
          'Our payment providers (Stripe, Link and Waffo) collect your payment details on their own pages. We never receive or store your full card number.',
        ],
      },
      'Information collected automatically:',
      {
        list: [
          'Technical data such as your IP address, browser and device type, and the pages you visit, in our server logs.',
          'The IP address you signed up from, kept on your account to stop people from collecting free credits with many accounts.',
          'Signals from our bot check (hCaptcha) when you sign up or sign in.',
          'Usage analytics and error reports, described in "Analytics, cookies and error reports" below.',
        ],
      },
      'We do not ask for sensitive information, such as health, religion or government ID numbers. Please do not upload photos or text that contain it. We do not use your photos to identify anyone or to create face or other biometric templates.',
    ],
  },
  {
    id: 'use',
    heading: 'How we use your information',
    blocks: [
      {
        list: [
          'To run the Service: create your account, sign you in, create images from your photos, show you your works, and keep your credit balance.',
          'To take payments, add credits, manage subscriptions and handle refunds.',
          'To show public works, and to run the Wishlist.',
          'To keep the Service safe: prevent fraud and abuse, enforce limits on free credits, and investigate misuse.',
          'To understand how the Service is used and fix problems, through analytics and error reports.',
          'To send account emails, such as email confirmation and password reset. We do not send marketing emails.',
          'To answer your messages, and to comply with the law and enforce our terms.',
        ],
      },
      `We do not sell your personal information, we do not share it for targeted advertising, and we do not use your photos or works to train AI models.`,
      'If you are in the European Economic Area, the United Kingdom or Switzerland: we process your information to perform our contract with you (running the Service and taking payments), for our legitimate interests (security, fraud prevention, analytics and improving the Service), to comply with legal obligations (such as keeping tax records), and with your consent where we ask for it.',
    ],
  },
  {
    id: 'public',
    heading: 'Public works',
    blocks: [
      'Images created with free credits are public, and so is any paid work you choose to make public. A public work can be seen by anyone, together with the template name and the text you entered for it. We do not show the photo you uploaded or your email address with a public work.',
      `You can delete a free work at any time, and you can make a paid work private again. Copies that other people saved or shared before then may still exist outside ${entity.site}.`,
      'On the Wishlist, other signed-in users see your request with a shortened display name (the first letter followed by ***).',
    ],
  },
]
