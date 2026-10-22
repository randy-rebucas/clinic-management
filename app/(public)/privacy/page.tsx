import { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';
import LegalDocument, { ContactCard, H3, List, P, type LegalSection } from '@/components/LegalDocument';

export const metadata: Metadata = pageMetadata({
  title: 'Privacy Policy',
  path: '/privacy',
  description: 'How MyClinicSoft collects, uses, and protects personal and health information, in line with the Philippine Data Privacy Act of 2012.',
});

const sections: LegalSection[] = [
  {
    id: 'introduction',
    title: 'Introduction',
    body: (
      <P>
        MyClinicSoft (&quot;we,&quot; &quot;our,&quot; or &quot;us&quot;) is committed to protecting your privacy.
        This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our
        clinic management software and services.
      </P>
    ),
  },
  {
    id: 'collection',
    title: 'Information We Collect',
    body: (
      <>
        <H3>Information you provide</H3>
        <List
          items={[
            'Account information (name, email, phone number)',
            'Clinic information and settings',
            'Patient data entered into the system',
            'Payment and billing information',
            'Support communications',
          ]}
        />
        <H3>Automatically collected information</H3>
        <List
          items={[
            'Usage data and analytics',
            'Device information',
            'IP addresses and location data',
            'Cookies and similar tracking technologies',
          ]}
        />
      </>
    ),
  },
  {
    id: 'use',
    title: 'How We Use Your Information',
    body: (
      <>
        <P>We use the information we collect to:</P>
        <List
          items={[
            'Provide, maintain, and improve our services',
            'Process transactions and send related information',
            'Send technical notices and support messages',
            'Respond to your comments and questions',
            'Monitor and analyze usage patterns',
            'Detect, prevent, and address technical issues',
            'Comply with legal obligations',
          ]}
        />
      </>
    ),
  },
  {
    id: 'security',
    title: 'Data Protection & Security',
    body: (
      <>
        <P>We implement industry-standard security measures to protect your data:</P>
        <List
          items={[
            'Encryption for data in transit (TLS)',
            'Encryption at rest for stored data',
            'Role-based access controls',
            'Regular security audits and assessments',
            'Comprehensive audit logging',
            'Secure data centers with physical security',
          ]}
        />
      </>
    ),
  },
  {
    id: 'compliance',
    title: 'Compliance',
    body: (
      <P>
        MyClinicSoft is built to help clinics comply with the <strong className="font-semibold text-gray-900">Data
        Privacy Act of 2012 (Republic Act No. 10173)</strong> and its implementing rules, along with other applicable
        Philippine data protection regulations.
      </P>
    ),
  },
  {
    id: 'sharing',
    title: 'Data Sharing & Disclosure',
    body: (
      <>
        <P>We do not sell your data. We may share information only in the following circumstances:</P>
        <List
          items={[
            'With your explicit consent',
            'To comply with legal obligations',
            'To protect our rights and safety',
            'With service providers who assist in operations (under strict confidentiality agreements)',
            'In connection with a business transfer (merger, acquisition, etc.)',
          ]}
        />
      </>
    ),
  },
  {
    id: 'rights',
    title: 'Your Rights',
    body: (
      <>
        <P>You have the right to:</P>
        <List
          items={[
            'Access your personal data',
            'Correct inaccurate data',
            'Request deletion of your data',
            'Export your data',
            'Object to processing of your data',
            'Withdraw consent where applicable',
          ]}
        />
      </>
    ),
  },
  {
    id: 'retention',
    title: 'Data Retention',
    body: (
      <P>
        We retain your data for as long as your account is active or as needed to provide services. After account
        termination, we retain data for 30 days, then permanently delete it unless required by law to retain it longer.
      </P>
    ),
  },
  {
    id: 'cookies',
    title: 'Cookies',
    body: (
      <P>
        We use cookies and similar technologies to enhance your experience, analyze usage, and assist in marketing
        efforts. You can control cookies through your browser settings.
      </P>
    ),
  },
  {
    id: 'children',
    title: 'Children’s Privacy',
    body: (
      <P>
        Our services are not intended for individuals under 18 years of age. We do not knowingly collect personal
        information from children.
      </P>
    ),
  },
  {
    id: 'changes',
    title: 'Changes to This Policy',
    body: (
      <P>
        We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new
        policy on this page and updating the &quot;Last updated&quot; date.
      </P>
    ),
  },
  {
    id: 'contact',
    title: 'Contact Us',
    body: (
      <>
        <P>If you have questions about this Privacy Policy, please contact us:</P>
        <ContactCard email="privacy@myclinicsoft.solutions" />
      </>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <LegalDocument
      title="Privacy Policy"
      summary="What information MyClinicSoft and the eMCR app collect, why, and how we keep it safe under the Philippine Data Privacy Act."
      updated="2026-10-22"
      sections={sections}
      related={[
        { href: '/terms', label: 'Terms of Service' },
        { href: '/security', label: 'Security' },
      ]}
    />
  );
}
