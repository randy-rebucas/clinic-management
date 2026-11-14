import Link from 'next/link';
import { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';
import LegalDocument, { ContactCard, H3, List, P, type LegalSection } from '@/components/LegalDocument';
import DeletionRequestForm, { PRIVACY_EMAIL } from '@/components/DeletionRequestForm';

export const metadata: Metadata = pageMetadata({
  title: 'Delete Your Account',
  path: '/delete-account',
  description:
    'How to ask DevCom Digital to delete your eMCR, eMedRoute, or MyClinicSoft account and the personal data associated with it.',
});

const sections: LegalSection[] = [
  {
    id: 'request',
    title: 'Request Deletion',
    body: (
      <>
        <P>
          This page covers the eMCR patient app, the eMedRoute medical representative app, and MyClinicSoft, all
          provided by DevCom Digital. Fill in the form to email a deletion request to our Data Protection Officer from
          your own email address. You don&apos;t need to be signed in.
        </P>
        <DeletionRequestForm />
        <P>
          You can also write to <a href={`mailto:${PRIVACY_EMAIL}`} className="font-semibold text-brand-teal-dark hover:underline underline-offset-2">{PRIVACY_EMAIL}</a>{' '}
          with the subject &quot;Account deletion&quot;, the app you use, your name, and the mobile number or email you
          sign in with.
        </P>
      </>
    ),
  },
  {
    id: 'process',
    title: 'What Happens Next',
    body: (
      <List
        items={[
          'We reply to confirm we received your request.',
          'We check that the request comes from the account holder. We may ask you to confirm it from the mobile number or email on the account.',
          'We delete the account and tell you when it is done, within 30 days of confirming your identity.',
          'Deleting an account cannot be undone. Sign up again if you want to use the app later.',
        ]}
      />
    ),
  },
  {
    id: 'deleted',
    title: 'What We Delete',
    body: (
      <>
        <H3>eMCR patient app</H3>
        <List
          items={[
            'Your eMCR account, mobile number, and sign-in sessions',
            'Your links to dependents you added and to the clinics you connected',
            'Booking requests, access requests, and messages sent through the app',
            'Device push-notification tokens and notification settings',
          ]}
        />
        <H3>eMedRoute medical representative app</H3>
        <List
          items={[
            'Your rep account, profile, contact details, and sign-in sessions',
            'Visit logs, private notes, AI-drafted notes, and team memberships',
            'Your referral code and links to clinics, and device push-notification tokens',
          ]}
        />
        <H3>MyClinicSoft staff accounts and clinics</H3>
        <P>
          Your clinic administrator can remove a staff account at any time; ask them first. A clinic administrator can
          ask us to delete the whole clinic, including all its patient records, after closing its subscription.
        </P>
      </>
    ),
  },
  {
    id: 'kept',
    title: 'What We Keep, and For How Long',
    body: (
      <>
        <List
          items={[
            'Invoices and payment records, which we keep for as long as Philippine tax rules (BIR) require',
            'Audit logs showing who viewed or changed records, kept for security and legal compliance',
            'Copies in backups, which are overwritten on a rolling basis and are not restored for normal use',
          ]}
        />
        <H3>Records held by clinics</H3>
        <P>
          Your medical records at a clinic belong to that clinic, which must keep them as the law requires. Deleting
          your eMCR account removes your access to them but does not delete them. To have clinic records erased, ask
          the clinic, or mention the clinic in your request and we will pass it on and help the clinic respond.
        </P>
      </>
    ),
  },
  {
    id: 'contact',
    title: 'Data Protection Officer',
    body: (
      <>
        <P>
          For questions about deletion or your other rights under the Data Privacy Act of 2012, see the{' '}
          <Link href="/privacy" className="font-semibold text-brand-teal-dark hover:underline underline-offset-2">
            Privacy Policy
          </Link>{' '}
          or contact us:
        </P>
        <ContactCard email={PRIVACY_EMAIL} />
      </>
    ),
  },
];

export default function DeleteAccountPage() {
  return (
    <LegalDocument
      title="Delete Your Account"
      summary="Ask us to delete your eMCR, eMedRoute, or MyClinicSoft account and the personal data associated with it."
      updated="2026-11-14"
      sections={sections}
      related={[
        { href: '/privacy', label: 'Privacy Policy' },
        { href: '/terms', label: 'Terms of Service' },
      ]}
    />
  );
}
