import { defineLegalPage } from '@/core/content'

import { LAST_UPDATED, contactSection, emailLink, entity, legalLinks, operatorSentence } from './shared'

const openAiPolicies = { href: 'https://openai.com/policies/usage-policies/', label: 'usage policies' }

// Graylum folds these rules into its terms ("Prohibited activities"); Shotviva handles
// people's photos, so they get a page of their own (LAUNCH §8, ARCHITECTURE §5, §15.5).
export const acceptableUsePage = defineLegalPage({
  path: legalLinks.acceptableUse.href,
  title: `Acceptable Use Policy | ${entity.site}`,
  description: `What you may and may not upload to ${entity.site}, create with it, or do with the service.`,
  h1: 'Acceptable Use Policy',
  label: 'Acceptable Use',
  lastUpdated: LAST_UPDATED,
  intro: [
    operatorSentence,
    [
      `This policy lists what you may not do on ${entity.site}. It is part of our `,
      legalLinks.terms,
      '. It applies to every photo you upload, every image you create, every template request you post, and every use of your account, including through a connected partner app such as Graylum.',
    ],
  ],
  sections: [
    {
      id: 'your-photos',
      heading: 'Only upload photos you have the right to use',
      blocks: [
        {
          list: [
            'Upload only photos you took yourself, or photos you have permission to use and edit.',
            'If a photo shows a recognizable person, you must have their permission to upload and edit it; for a person under 18, you need the permission of their parent or legal guardian. Do not upload photos of other people taken without their knowledge.',
            'Do not upload photos that show someone else’s logo, brand, artwork or other protected work unless you have the right to use it.',
            'Do not upload documents such as IDs, passports, bank cards or medical records.',
          ],
        },
      ],
    },
    {
      id: 'not-allowed',
      heading: 'Content you may not upload or create',
      blocks: [
        {
          list: [
            'Any sexual content involving a minor, or any content that sexualizes a minor. We report it to the National Center for Missing & Exploited Children (NCMEC) and to law enforcement.',
            'Nudity or sexually explicit content of any person.',
            'Intimate or sexual images of a real person made or shared without their consent.',
            'Images that put a real, identifiable person into a fake situation to deceive, embarrass, harass or harm them, or that make them appear to say or endorse something they did not.',
            'Violence, threats, harassment, bullying, or content that attacks people based on race, ethnicity, religion, gender, sexual orientation, disability or similar traits.',
            'Content that promotes self-harm, terrorism, or illegal activity, including illegal drugs, weapons or scams.',
            'Fake documents, receipts, IDs, tickets or official materials, or anything made to commit fraud.',
            'Content that copies a specific artwork, character, artist’s signature style, brand or trademark you do not have rights to.',
          ],
        },
      ],
    },
    {
      id: 'honest-listings',
      heading: 'Do not mislead buyers or guests',
      blocks: [
        'Many people use our templates for menus, product listings and rental listings. You are responsible for making sure an edited photo does not mislead the people who see it.',
        {
          list: [
            'Do not use edits to hide damage or defects, or to show a product, dish, room or property that is different from what people will actually get.',
            'Follow the rules of the platform where you post the photo (for example a food delivery app, a marketplace or a rental site), including any rules about edited or AI-made images.',
            'Follow advertising and consumer protection laws that apply to you.',
          ],
        },
      ],
    },
    {
      id: 'service-rules',
      heading: 'Rules for using the service',
      blocks: [
        {
          list: [
            'Do not remove, crop out, cover or edit the watermark on free works, or try to get a free work without the watermark.',
            'Do not create more than one account, use fake details, or use other tricks to get extra free credits or get around limits.',
            'Do not use bots, scripts or scrapers to access the service, create images in bulk, or copy content from the site, except through an integration we have approved.',
            'Do not try to find out, extract or copy our template instructions or how our templates work, and do not reverse engineer the service.',
            'Do not resell, rent out or share access to your account or credits, unless we agree in writing.',
            'Do not test, probe or break our security, overload our systems, or interfere with other users.',
            'Do not use the service to build a competing product or a dataset of our outputs.',
            'Do not make payment disputes in bad faith, or pay with a card or account you are not allowed to use.',
          ],
        },
      ],
    },
    {
      id: 'wishlist',
      heading: 'Template requests',
      blocks: [
        'When you post a template request on the Wishlist, the description and reference images must follow this policy. Do not post spam, ads, unrelated content, reviews of other businesses, or reference images you do not have the right to share. We review every request before it appears on the Wishlist.',
      ],
    },
    {
      id: 'ai-providers',
      heading: 'Our AI provider’s rules',
      blocks: [
        [
          'Images are created by OpenAI’s image models. You must also follow OpenAI’s ',
          openAiPolicies,
          '. If OpenAI declines a request, the image is not created and no credits are used.',
        ],
      ],
    },
    {
      id: 'enforcement',
      heading: 'What we do if you break this policy',
      blocks: [
        'We may, without notice and at our discretion:',
        {
          list: [
            'Block a request, or remove an image, photo or template request.',
            'Make a work private or remove it from public pages.',
            'Suspend or close your account and cancel your credits without a refund, as described in our Refund Policy.',
            'Report content or activity to law enforcement or other authorities where we believe the law requires it or someone is at risk.',
          ],
        },
      ],
    },
    {
      id: 'report',
      heading: 'Report a problem',
      blocks: [
        [
          'If you see content on our service that breaks this policy, or a photo of you was used without your permission, email ',
          emailLink,
          ' with a link or a description. For copyright complaints, see "Copyright complaints" in our ',
          legalLinks.terms,
          '.',
        ],
      ],
    },
    contactSection('this Acceptable Use Policy'),
  ],
})
