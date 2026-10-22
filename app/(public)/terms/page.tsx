import { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';
import LegalDocument, { ContactCard, H3, List, P, type LegalSection } from '@/components/LegalDocument';

export const metadata: Metadata = pageMetadata({
  title: 'Terms of Service',
  path: '/terms',
  description: 'The terms and conditions for using MyClinicSoft clinic management software and the eMCR patient app.',
});

const sections: LegalSection[] = [
  {
    id: 'agreement',
    title: 'Agreement to Terms',
    body: (
      <>
        <P>
          MyClinicSoft and the eMCR patient app (together, the &quot;Service&quot;) are operated by DevCom Digital, a
          business registered in the Philippines (&quot;we,&quot; &quot;us&quot;). By creating an account or using the
          Service, you agree to these Terms. If you use the Service on behalf of a clinic, you confirm that you may bind
          that clinic to them.
        </P>
        <P>If you do not agree, do not use the Service.</P>
      </>
    ),
  },
  {
    id: 'license',
    title: 'Use License',
    body: (
      <>
        <P>We give you a non-exclusive, non-transferable right to use the Service for your clinic&apos;s own operations. You may not:</P>
        <List
          items={[
            'Resell, sublicense, or give third parties access to the Service',
            'Reverse engineer the Service or attempt to extract its source code',
            'Use the Service for any unlawful purpose',
            'Remove copyright or proprietary notices',
          ]}
        />
      </>
    ),
  },
  {
    id: 'accounts',
    title: 'Accounts',
    body: (
      <>
        <P>You must:</P>
        <List
          items={[
            'Give accurate and complete registration information',
            'Keep your sign-in credentials secure and not share accounts between staff',
            'Accept responsibility for activity under your clinic’s accounts',
            'Tell us promptly at legal@myclinicsoft.solutions if you suspect unauthorized access',
          ]}
        />
      </>
    ),
  },
  {
    id: 'billing',
    title: 'Subscription & Billing',
    body: (
      <>
        <H3>Plans and payment</H3>
        <List
          items={[
            'Subscriptions are billed in advance, monthly or yearly, at the prices on our pricing page in Philippine pesos',
            'We may change prices with at least 30 days’ notice; a change applies from your next billing period',
            'You are responsible for applicable taxes',
          ]}
        />
        <H3>No refunds</H3>
        <P>
          All payments are final and non-refundable, including for unused time in a billing period, downgrades, and
          accounts closed early, except where Philippine law requires otherwise. Use the free trial to decide whether
          the Service fits your clinic before you pay.
        </P>
        <H3>Expired subscriptions</H3>
        <P>
          If a subscription is not renewed, your clinic&apos;s account becomes read-only for a 7-day grace period so you
          can still view and export your records. After that, access is suspended until you subscribe again. Your data
          is not deleted because a payment was missed.
        </P>
      </>
    ),
  },
  {
    id: 'trial',
    title: 'Free Trial',
    body: (
      <>
        <P>New clinics can use a 14-day free trial:</P>
        <List
          items={[
            'No credit card is required to start',
            'The trial plan has the patient, user, and feature limits shown on our pricing page',
            'Your data carries over if you subscribe',
            'The trial ends after 14 days unless you subscribe; the expiry rules above then apply',
          ]}
        />
      </>
    ),
  },
  {
    id: 'emcr',
    title: 'eMCR Patient App',
    body: (
      <>
        <P>
          eMCR lets patients see their records and book with clinics that use MyClinicSoft. Clinics do not pay for
          eMCR.
        </P>
        <List
          items={[
            'Some features may require activation with a voucher bought for cash at a participating clinic (₱80)',
            'Each voucher activates the eMCR account for one year; renewals add a year to the current expiry',
            'Vouchers are non-refundable and cannot be exchanged for cash',
            'You can always view a basic summary of your own records without activation',
            'A clinic remains responsible for the records it keeps about you; contact the clinic to correct them',
          ]}
        />
      </>
    ),
  },
  {
    id: 'responsibilities',
    title: 'Clinic Responsibilities',
    body: (
      <>
        <P>Your clinic is the personal information controller for the patient data it enters. You agree to:</P>
        <List
          items={[
            'Comply with the Data Privacy Act of 2012 (RA 10173) and other applicable healthcare laws',
            'Have a lawful basis, and patient consent where required, for the data you enter and the messages you send',
            'Keep patient data confidential and limit staff access to what each role needs',
            'Not upload malicious code or interfere with the Service',
          ]}
        />
      </>
    ),
  },
  {
    id: 'clinical',
    title: 'Clinical Decisions & AI Features',
    body: (
      <P>
        The Service is a records and workflow tool, not a medical device, and does not give medical advice. Drafts
        produced by AI features such as the scribe may be incomplete or wrong; a licensed professional must review
        them before they are saved, signed, or relied on. Clinical decisions remain the responsibility of the treating
        professional.
      </P>
    ),
  },
  {
    id: 'data',
    title: 'Data & Content',
    body: (
      <>
        <H3>Your data</H3>
        <P>
          Your clinic owns the data it enters. We process it only to provide the Service, as described in our Privacy
          Policy.
        </P>
        <H3>Backups</H3>
        <P>We keep backups of the Service, but you should regularly export the records your clinic must keep.</P>
        <H3>After termination</H3>
        <P>
          You can export your data while your account is active or read-only. After an account is closed, a clinic
          administrator can ask us in writing to delete the clinic&apos;s data, and we will do so within 30 days of the
          request, except for anything the law requires us to keep.
        </P>
      </>
    ),
  },
  {
    id: 'availability',
    title: 'Service Availability',
    body: (
      <>
        <P>We work to keep the Service available but do not guarantee uninterrupted service. We may:</P>
        <List
          items={[
            'Perform scheduled maintenance, with advance notice where practical',
            'Experience unscheduled downtime due to technical issues',
            'Change or discontinue features with reasonable notice',
          ]}
        />
      </>
    ),
  },
  {
    id: 'ip',
    title: 'Intellectual Property',
    body: (
      <P>
        MyClinicSoft, eMCR, and their software, content, and branding are owned by DevCom Digital and protected by
        intellectual property laws.
      </P>
    ),
  },
  {
    id: 'termination',
    title: 'Termination',
    body: (
      <>
        <P>You can stop using the Service at any time. We may suspend or close an account for:</P>
        <List
          items={[
            'Serious or repeated violation of these Terms',
            'Non-payment, after the grace period above',
            'Fraudulent or illegal activity',
          ]}
        />
        <P>Where we can, we will give notice and a chance to export your data first.</P>
      </>
    ),
  },
  {
    id: 'liability',
    title: 'Limitation of Liability',
    body: (
      <>
        <P>
          The Service is provided &quot;as is.&quot; To the extent the law allows, we are not liable for indirect,
          incidental, special, or consequential damages, or for lost profits or data, arising from your use of the
          Service.
        </P>
        <P>
          Our total liability for any claim is limited to the fees your clinic paid us in the 12 months before the event
          giving rise to the claim.
        </P>
      </>
    ),
  },
  {
    id: 'indemnification',
    title: 'Indemnification',
    body: (
      <P>
        You agree to indemnify DevCom Digital against claims, damages, and expenses arising from your clinic&apos;s use
        of the Service, the data you enter, or your violation of these Terms or applicable law.
      </P>
    ),
  },
  {
    id: 'changes',
    title: 'Changes to Terms',
    body: (
      <P>
        We may update these Terms. We will tell clinic administrators about material changes by email or in the
        Service at least 15 days before they take effect. Continuing to use the Service after that means you accept
        them.
      </P>
    ),
  },
  {
    id: 'law',
    title: 'Governing Law & Disputes',
    body: (
      <P>
        These Terms are governed by the laws of the Republic of the Philippines. Both sides will first try to settle a
        dispute in good faith by writing to the other; if that fails within 30 days, it goes to the proper courts of
        the Philippines.
      </P>
    ),
  },
  {
    id: 'contact',
    title: 'Contact Information',
    body: (
      <>
        <P>Questions about these Terms:</P>
        <ContactCard email="legal@myclinicsoft.solutions" />
      </>
    ),
  },
];

export default function TermsPage() {
  return (
    <LegalDocument
      title="Terms of Service"
      summary="The rules for using MyClinicSoft and the eMCR app — what you can expect from us, and what we expect from you."
      updated="2026-10-22"
      sections={sections}
      related={[
        { href: '/privacy', label: 'Privacy Policy' },
        { href: '/security', label: 'Security' },
      ]}
    />
  );
}
