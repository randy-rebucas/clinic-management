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
      <P>
        By accessing or using MyClinicSoft (&quot;Service&quot;), you agree to be bound by these Terms of Service.
        If you disagree with any part of these terms, you may not access the Service.
      </P>
    ),
  },
  {
    id: 'license',
    title: 'Use License',
    body: (
      <>
        <P>Permission is granted to use MyClinicSoft for your clinic management needs. This license does not include:</P>
        <List
          items={[
            'Reselling or sublicensing the software',
            'Reverse engineering or attempting to extract source code',
            'Using the service for any illegal purpose',
            'Removing copyright or proprietary notations',
          ]}
        />
      </>
    ),
  },
  {
    id: 'accounts',
    title: 'Account Registration',
    body: (
      <>
        <P>To use MyClinicSoft, you must:</P>
        <List
          items={[
            'Provide accurate and complete registration information',
            'Maintain the security of your account credentials',
            'Accept responsibility for all activities under your account',
            'Notify us immediately of any unauthorized access',
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
        <H3>Subscription plans</H3>
        <P>
          MyClinicSoft offers various subscription plans. By subscribing, you agree to pay the fees associated with
          your chosen plan.
        </P>
        <H3>Billing</H3>
        <List
          items={[
            'Subscriptions are billed in advance on a monthly or annual basis',
            'All fees are non-refundable except as required by law',
            'We reserve the right to change pricing with 30 days notice',
            'Failed payments may result in service suspension',
          ]}
        />
        <H3>Refunds</H3>
        <P>
          We offer a 30-day money-back guarantee. Refund requests must be made within 30 days of initial subscription
          purchase.
        </P>
      </>
    ),
  },
  {
    id: 'trial',
    title: 'Free Trial',
    body: (
      <>
        <P>We offer a 14-day free trial. During the trial:</P>
        <List
          items={[
            'You have full access to all features',
            'No credit card required to start',
            'Your data is preserved if you subscribe after trial',
            'Service automatically expires after 14 days unless you subscribe',
          ]}
        />
      </>
    ),
  },
  {
    id: 'responsibilities',
    title: 'User Responsibilities',
    body: (
      <>
        <P>You agree to:</P>
        <List
          items={[
            'Use the Service only for lawful purposes',
            'Comply with all applicable healthcare and privacy laws, including the Data Privacy Act of 2012 (RA 10173)',
            'Maintain the confidentiality of patient data',
            'Not transmit viruses or malicious code',
            'Not interfere with or disrupt the Service',
            'Not use the Service to violate any laws or regulations',
          ]}
        />
      </>
    ),
  },
  {
    id: 'data',
    title: 'Data & Content',
    body: (
      <>
        <H3>Your data</H3>
        <P>You retain all rights to data you enter into MyClinicSoft. We do not claim ownership of your data.</P>
        <H3>Data backup</H3>
        <P>While we maintain regular backups, you are responsible for maintaining your own backups of critical data.</P>
        <H3>Data deletion</H3>
        <P>Upon account termination, your data will be deleted after 30 days. You may export your data before termination.</P>
      </>
    ),
  },
  {
    id: 'availability',
    title: 'Service Availability',
    body: (
      <>
        <P>We strive for 99.9% uptime but do not guarantee uninterrupted service. We may:</P>
        <List
          items={[
            'Perform scheduled maintenance with advance notice',
            'Experience unscheduled downtime due to technical issues',
            'Modify or discontinue features with reasonable notice',
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
        MyClinicSoft and its original content, features, and functionality are owned by DevCom Digital and are
        protected by copyright, trademark, and other intellectual property laws.
      </P>
    ),
  },
  {
    id: 'termination',
    title: 'Termination',
    body: (
      <>
        <P>We may terminate or suspend your account immediately, without prior notice, for:</P>
        <List
          items={[
            'Violation of these Terms of Service',
            'Non-payment of fees',
            'Fraudulent or illegal activity',
            'Extended periods of inactivity',
          ]}
        />
      </>
    ),
  },
  {
    id: 'liability',
    title: 'Limitation of Liability',
    body: (
      <P>
        MyClinicSoft is provided &quot;as is&quot; without warranties. We shall not be liable for any indirect,
        incidental, special, or consequential damages arising from your use of the Service.
      </P>
    ),
  },
  {
    id: 'indemnification',
    title: 'Indemnification',
    body: (
      <P>
        You agree to indemnify and hold harmless MyClinicSoft from any claims, damages, or expenses arising from your
        use of the Service or violation of these terms.
      </P>
    ),
  },
  {
    id: 'changes',
    title: 'Changes to Terms',
    body: (
      <P>
        We reserve the right to modify these terms at any time. We will notify users of material changes via email or
        through the Service. Continued use after changes constitutes acceptance.
      </P>
    ),
  },
  {
    id: 'law',
    title: 'Governing Law',
    body: (
      <P>
        These Terms shall be governed by and construed in accordance with the laws of the Republic of the Philippines,
        without regard to conflict of law provisions.
      </P>
    ),
  },
  {
    id: 'contact',
    title: 'Contact Information',
    body: (
      <>
        <P>If you have questions about these Terms, please contact us:</P>
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
