import { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';
import LegalDocument, { ContactCard, H3, List, P, type LegalSection } from '@/components/LegalDocument';

export const metadata: Metadata = pageMetadata({
  title: 'Privacy Policy',
  path: '/privacy',
  description: 'How MyClinicSoft collects, uses, and protects personal and health information, in line with the Philippine Data Privacy Act of 2012.',
});

const subprocessors: [string, string][] = [
  ['Vercel', 'Application hosting'],
  ['MongoDB Atlas', 'Database hosting'],
  ['Cloudinary', 'Storage of uploaded files and documents'],
  ['Twilio', 'SMS reminders and one-time sign-in codes'],
  ['Email delivery provider', 'Transactional email (sign-in links, reminders, receipts)'],
  ['Anthropic', 'AI scribe drafts, only when a clinic turns the scribe on'],
  ['Jitsi (meet.jit.si)', 'Video for teleconsultations, only when a clinic uses them'],
  ['PayMongo and PayPal', 'Subscription and patient bill payments'],
  ['Expo and web push services', 'Mobile and browser notifications'],
  ['Sentry', 'Error monitoring'],
];

const sections: LegalSection[] = [
  {
    id: 'introduction',
    title: 'Who We Are',
    body: (
      <>
        <P>
          MyClinicSoft and the eMCR patient app are provided by DevCom Digital, a business registered in the
          Philippines (&quot;we,&quot; &quot;us&quot;). This policy explains what personal information we handle, why,
          and the choices you have under the Data Privacy Act of 2012 (RA 10173).
        </P>
        <H3>Clinics and patients</H3>
        <P>
          When a clinic records information about its patients in MyClinicSoft, the clinic is the personal information
          controller for those records and decides how they are used. We act as its personal information processor: we
          store and process the records only to run the Service for that clinic. Patients who want to access, correct,
          or delete clinic records should contact the clinic first; we will help the clinic respond.
        </P>
        <P>
          We are the controller for clinic staff accounts, eMCR accounts, billing information, and enquiries sent to
          us.
        </P>
      </>
    ),
  },
  {
    id: 'collection',
    title: 'Information We Collect',
    body: (
      <>
        <H3>From clinics and their staff</H3>
        <List
          items={[
            'Staff account details: name, email, phone, role, and sign-in security settings',
            'Clinic details and settings',
            'Patient records the clinic enters, which can include health information such as consultations, diagnoses, prescriptions, lab results, and documents',
            'Billing records for the clinic’s subscription',
          ]}
        />
        <H3>From patients using eMCR or online booking</H3>
        <List
          items={[
            'Mobile number, verified with a one-time code',
            'Name and date of birth, used to match you to records your clinics hold',
            'Dependents you add, such as children',
            'Booking requests and check-ins',
            'Device push-notification tokens',
          ]}
        />
        <H3>Collected automatically</H3>
        <List
          items={[
            'IP address and browser or device information, used for security and rate limiting',
            'Audit logs of who viewed or changed records',
            'Error reports when something breaks',
          ]}
        />
      </>
    ),
  },
  {
    id: 'use',
    title: 'How We Use Information',
    body: (
      <>
        <P>We use personal information to:</P>
        <List
          items={[
            'Provide the Service: records, scheduling, billing, reminders, and patient access through eMCR',
            'Verify identity and keep accounts secure',
            'Send service messages, such as reminders, sign-in codes, and receipts',
            'Provide support and respond to enquiries',
            'Detect and fix errors and misuse',
            'Comply with legal obligations',
          ]}
        />
        <P>
          Clinic patient data is processed on the clinic&apos;s instructions. We do not use it for our own marketing, we
          do not sell it, and we do not use it to train AI models.
        </P>
      </>
    ),
  },
  {
    id: 'security',
    title: 'Data Protection & Security',
    body: (
      <>
        <P>Measures we use include:</P>
        <List
          items={[
            'TLS encryption for data in transit',
            'Additional AES-256 encryption of sensitive fields',
            'Role-based access controls and two-factor authentication for staff',
            'Audit logs of access to and changes in patient records',
            'Rate limiting on sign-in and public forms',
            'Regular backups',
          ]}
        />
        <P>
          If a personal data breach is likely to put people at real risk, we will notify the affected clinics and,
          where the law requires, the National Privacy Commission, within the periods set by its rules.
        </P>
      </>
    ),
  },
  {
    id: 'sharing',
    title: 'Service Providers & Disclosure',
    body: (
      <>
        <P>
          We share personal information only with the service providers below, which process it for us under
          contract, or when the law requires it. Some are based outside the Philippines, mainly in the United States,
          so information may be transferred and stored abroad; we choose providers that keep it protected to a
          standard comparable to the Data Privacy Act.
        </P>
        <div className="mt-4 overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-semibold">Provider</th>
                <th scope="col" className="px-4 py-2.5 font-semibold">Purpose</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 text-gray-700">
              {subprocessors.map(([name, purpose]) => (
                <tr key={name}>
                  <td className="px-4 py-2.5 font-medium text-gray-900">{name}</td>
                  <td className="px-4 py-2.5">{purpose}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <P>
          We may also disclose information to comply with a law, court order, or lawful request from authorities, or as
          part of a merger or sale of the business, in which case this policy continues to apply.
        </P>
      </>
    ),
  },
  {
    id: 'rights',
    title: 'Your Rights',
    body: (
      <>
        <P>Under the Data Privacy Act you have the right to:</P>
        <List
          items={[
            'Be informed about how your personal information is processed',
            'Access your personal information',
            'Object to processing, and withdraw consent where processing relies on it',
            'Have inaccurate information corrected',
            'Have information erased or blocked where the law allows',
            'Receive your information in a portable electronic format',
            'Claim damages for harm caused by unlawful processing',
            'File a complaint with the National Privacy Commission (privacy.gov.ph)',
          ]}
        />
        <P>
          To use these rights, contact the clinic for clinic records, or our Data Protection Officer for anything we
          control. We may need to verify your identity first.
        </P>
      </>
    ),
  },
  {
    id: 'retention',
    title: 'Data Retention',
    body: (
      <>
        <P>
          Clinic records are kept for as long as the clinic&apos;s account is active, and the clinic decides its own
          retention periods for patient records within the law. After a clinic closes its account, we delete its data
          within 30 days of a written request from a clinic administrator, except for anything the law requires us to
          keep.
        </P>
        <P>
          eMCR accounts are kept until you ask us to close them. Backups and logs are overwritten on a rolling basis.
        </P>
      </>
    ),
  },
  {
    id: 'cookies',
    title: 'Cookies',
    body: (
      <P>
        We use only cookies needed to run the Service, such as keeping you signed in and protecting forms. We do not
        use advertising or third-party analytics cookies.
      </P>
    ),
  },
  {
    id: 'children',
    title: 'Minors',
    body: (
      <P>
        Clinics may keep records of patients under 18, and a parent or guardian may add a child as a dependent in
        eMCR. Accounts in eMCR are held by adults; a dependent&apos;s access passes to them when they turn 18.
      </P>
    ),
  },
  {
    id: 'changes',
    title: 'Changes to This Policy',
    body: (
      <P>
        We may update this policy. We will post the new version here with a new date and tell clinic administrators
        about material changes by email or in the Service.
      </P>
    ),
  },
  {
    id: 'contact',
    title: 'Data Protection Officer',
    body: (
      <>
        <P>For privacy questions or to exercise your rights, contact our Data Protection Officer:</P>
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
