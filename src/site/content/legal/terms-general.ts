import type { LegalSection } from '@/core/content'

import { emailLink, entity, legalLinks } from './shared'

// Terms of Service, part 3: termination, disclaimers, liability and the legal fine print.
// Governing law and venue match Graylum's terms (same company, Wyoming).

export const termsGeneralSections: readonly LegalSection[] = [
  {
    id: 'third-parties',
    heading: 'Third-party services',
    blocks: [
      'The Service relies on other companies, for example Google for sign-in, Stripe, Link and Waffo for payments, and OpenAI for creating images. Your use of their pages and services may also be covered by their own terms and privacy policies. We are not responsible for third-party websites or services we link to.',
    ],
  },
  {
    id: 'privacy',
    heading: 'Privacy',
    blocks: [
      [
        'Our ',
        legalLinks.privacy,
        ' explains what personal information we collect, how long we keep it, and your choices. The Service is run from the United States, and your information is processed there.',
      ],
    ],
  },
  {
    id: 'termination',
    heading: 'Ending your use of the Service',
    blocks: [
      'You can stop using the Service at any time, and you can delete your account from your account page. Deleting your account deletes your works and photos as described in our Privacy Policy, and any credits left on the account are lost.',
      [
        'We may suspend or close your account, or limit what you can do, if you break these Terms or our ',
        legalLinks.acceptableUse,
        ', if we are required to by law, or if your use puts other users, us or the Service at risk. Where reasonable, we will tell you why. If we close your account because you broke these Terms, you may not open a new one.',
      ],
      'What happens to unused paid credits when an account is closed is set out in our Refund Policy.',
      'Sections that by their nature should survive after these Terms end (such as licenses for content already shared, disclaimers, limits of liability, indemnity and governing law) continue to apply.',
    ],
  },
  {
    id: 'changes',
    heading: 'Changes to the Service and these Terms',
    blocks: [
      'We may change, pause or stop any part of the Service. We will try to give notice of changes that significantly affect paid features.',
      'We may update these Terms. For important changes we will give notice on the Service or by email at least seven (7) days before they take effect, unless the change is needed for legal or security reasons, in which case it may take effect at once. If you keep using the Service after a change takes effect, you accept the updated Terms. If you do not agree, stop using the Service and cancel any subscription.',
    ],
  },
  {
    id: 'disclaimer',
    heading: 'Disclaimer',
    blocks: [
      'THE SERVICE AND ALL OUTPUTS ARE PROVIDED "AS IS" AND "AS AVAILABLE". TO THE FULLEST EXTENT THE LAW ALLOWS, WE DISCLAIM ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE AND NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, SECURE OR ERROR-FREE, THAT OUTPUTS WILL BE ACCURATE, UNIQUE OR SUITABLE FOR YOUR PURPOSE, OR THAT YOUR CONTENT WILL NEVER BE LOST. KEEP YOUR OWN COPIES OF PHOTOS AND IMAGES THAT MATTER TO YOU.',
    ],
  },
  {
    id: 'liability',
    heading: 'Limitation of liability',
    blocks: [
      `TO THE FULLEST EXTENT THE LAW ALLOWS, ${entity.company.toUpperCase()} AND ITS MEMBERS, MANAGERS, EMPLOYEES AND AGENTS WILL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY OR PUNITIVE DAMAGES, OR FOR ANY LOSS OF PROFITS, REVENUE, DATA OR GOODWILL, ARISING FROM OR RELATED TO THE SERVICE, EVEN IF WE WERE TOLD THEY WERE POSSIBLE.`,
      'TO THE FULLEST EXTENT THE LAW ALLOWS, OUR TOTAL LIABILITY FOR ALL CLAIMS RELATED TO THE SERVICE IS LIMITED TO THE AMOUNT YOU PAID FOR THE SERVICE IN THE SIX (6) MONTHS BEFORE THE EVENT THAT GAVE RISE TO THE CLAIM.',
      'Some states and countries do not allow some of these limits. Where they do not, the limits apply only as far as the law allows, and you may have additional rights.',
    ],
  },
  {
    id: 'indemnity',
    heading: 'Indemnity',
    blocks: [
      `You agree to defend and indemnify ${entity.company} and its members, managers, employees and agents against any third-party claim, and the losses, damages and reasonable legal fees that come from it, arising from Your Content, your use of Outputs, or your breach of these Terms or of anyone’s rights. We will tell you about such a claim and may choose to take over its defense, in which case you agree to cooperate with us.`,
    ],
  },
  {
    id: 'law',
    heading: 'Governing law and disputes',
    blocks: [
      'These Terms are governed by the laws of the State of Wyoming, United States, without regard to its conflict of law rules.',
      [
        'Before filing a claim, please email ',
        emailLink,
        ' so we can try to resolve the problem informally.',
      ],
      'Any legal action between you and us must be brought in the state or federal courts located in Sheridan County, Wyoming, and you and we agree to the jurisdiction of those courts. The United Nations Convention on Contracts for the International Sale of Goods does not apply. Any claim related to the Service must be brought within one (1) year after it arose, where the law allows such a limit.',
      'Nothing in these Terms takes away rights you have under consumer protection laws that cannot be waived by contract.',
    ],
  },
  {
    id: 'general',
    heading: 'General',
    blocks: [
      {
        list: [
          'These Terms and the policies they refer to are the entire agreement between you and us about the Service.',
          'If any part of these Terms cannot be enforced, the rest stays in effect.',
          'If we do not enforce a right, we have not given it up.',
          'You may not transfer your rights under these Terms. We may transfer ours, for example as part of a sale or reorganization of our business.',
          'We are not responsible for delays or failures caused by events outside our reasonable control.',
          'You agree that we may give you notices and records electronically, by email or on the Service, and that this meets any legal requirement for written communication.',
          'Nothing in these Terms creates a partnership, employment or agency relationship between you and us.',
          'California residents: the Complaint Assistance Unit of the Division of Consumer Services of the California Department of Consumer Affairs can be reached in writing at 1625 North Market Blvd., Suite N 112, Sacramento, California 95834, or by phone at (800) 952-5210.',
        ],
      },
    ],
  },
]
