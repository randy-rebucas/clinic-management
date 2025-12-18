import Link from 'next/link';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy - MyClinicSoft',
  description: 'MyClinicSoft Privacy Policy - Learn how we protect and handle your data.',
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Background */}
      <div className="fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50"></div>
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]"></div>
      </div>

      {/* Content */}
      <section className="relative pt-24 sm:pt-32 pb-12 sm:pb-16 px-4 sm:px-6 lg:px-8">
        <div className="container mx-auto max-w-4xl">
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 sm:p-8 lg:p-12 shadow-lg">
            <h1 className="text-4xl sm:text-5xl font-extrabold text-gray-900 mb-4">Privacy Policy</h1>
            <p className="text-gray-600 mb-8">Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>

            <div className="prose prose-lg max-w-none space-y-8">
              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">1. Introduction</h2>
                <p className="text-gray-700 leading-relaxed mb-4">
                  MyClinicSoft ("we," "our," or "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our clinic management software and services.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">2. Information We Collect</h2>
                <h3 className="text-xl font-semibold text-gray-900 mb-3">2.1 Information You Provide</h3>
                <ul className="list-disc pl-6 space-y-2 text-gray-700 mb-4">
                  <li>Account information (name, email, phone number)</li>
                  <li>Clinic information and settings</li>
                  <li>Patient data entered into the system</li>
                  <li>Payment and billing information</li>
                  <li>Support communications</li>
                </ul>
                <h3 className="text-xl font-semibold text-gray-900 mb-3">2.2 Automatically Collected Information</h3>
                <ul className="list-disc pl-6 space-y-2 text-gray-700 mb-4">
                  <li>Usage data and analytics</li>
                  <li>Device information</li>
                  <li>IP addresses and location data</li>
                  <li>Cookies and similar tracking technologies</li>
                </ul>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">3. How We Use Your Information</h2>
                <p className="text-gray-700 leading-relaxed mb-4">We use the information we collect to:</p>
                <ul className="list-disc pl-6 space-y-2 text-gray-700">
                  <li>Provide, maintain, and improve our services</li>
                  <li>Process transactions and send related information</li>
                  <li>Send technical notices and support messages</li>
                  <li>Respond to your comments and questions</li>
                  <li>Monitor and analyze usage patterns</li>
                  <li>Detect, prevent, and address technical issues</li>
                  <li>Comply with legal obligations</li>
                </ul>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">4. Data Protection & Security</h2>
                <p className="text-gray-700 leading-relaxed mb-4">
                  We implement industry-standard security measures to protect your data:
                </p>
                <ul className="list-disc pl-6 space-y-2 text-gray-700">
                  <li>End-to-end encryption for data in transit (SSL/TLS)</li>
                  <li>Encryption at rest for stored data</li>
                  <li>Role-based access controls</li>
                  <li>Regular security audits and assessments</li>
                  <li>Comprehensive audit logging</li>
                  <li>Secure data centers with physical security</li>
                </ul>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">5. Compliance</h2>
                <p className="text-gray-700 leading-relaxed mb-4">
                  MyClinicSoft complies with:
                </p>
                <ul className="list-disc pl-6 space-y-2 text-gray-700">
                  <li><strong>HIPAA (Health Insurance Portability and Accountability Act)</strong> - For US-based healthcare providers</li>
                  <li><strong>PH DPA (Philippines Data Privacy Act)</strong> - For Philippines-based clinics</li>
                  <li><strong>GDPR (General Data Protection Regulation)</strong> - For EU-based users</li>
                  <li>Other applicable regional data protection laws</li>
                </ul>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">6. Data Sharing & Disclosure</h2>
                <p className="text-gray-700 leading-relaxed mb-4">
                  We do not sell your data. We may share information only in the following circumstances:
                </p>
                <ul className="list-disc pl-6 space-y-2 text-gray-700">
                  <li>With your explicit consent</li>
                  <li>To comply with legal obligations</li>
                  <li>To protect our rights and safety</li>
                  <li>With service providers who assist in operations (under strict confidentiality agreements)</li>
                  <li>In connection with a business transfer (merger, acquisition, etc.)</li>
                </ul>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">7. Your Rights</h2>
                <p className="text-gray-700 leading-relaxed mb-4">You have the right to:</p>
                <ul className="list-disc pl-6 space-y-2 text-gray-700">
                  <li>Access your personal data</li>
                  <li>Correct inaccurate data</li>
                  <li>Request deletion of your data</li>
                  <li>Export your data</li>
                  <li>Object to processing of your data</li>
                  <li>Withdraw consent where applicable</li>
                </ul>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">8. Data Retention</h2>
                <p className="text-gray-700 leading-relaxed">
                  We retain your data for as long as your account is active or as needed to provide services. 
                  After account termination, we retain data for 30 days, then permanently delete it unless 
                  required by law to retain it longer.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">9. Cookies</h2>
                <p className="text-gray-700 leading-relaxed mb-4">
                  We use cookies and similar technologies to enhance your experience, analyze usage, and assist 
                  in marketing efforts. You can control cookies through your browser settings.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">10. Children's Privacy</h2>
                <p className="text-gray-700 leading-relaxed">
                  Our services are not intended for individuals under 18 years of age. We do not knowingly 
                  collect personal information from children.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">11. Changes to This Policy</h2>
                <p className="text-gray-700 leading-relaxed">
                  We may update this Privacy Policy from time to time. We will notify you of any changes by 
                  posting the new policy on this page and updating the "Last updated" date.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">12. Contact Us</h2>
                <p className="text-gray-700 leading-relaxed mb-4">
                  If you have questions about this Privacy Policy, please contact us:
                </p>
                <div className="bg-gray-50 rounded-xl p-4">
                  <p className="text-gray-700">
                    <strong>Email:</strong> <a href="mailto:privacy@myclinicsoft.com" className="text-blue-600 hover:text-blue-700">privacy@myclinicsoft.com</a><br />
                    <strong>Address:</strong> 123 Healthcare Street, Medical District, MD 12345, United States
                  </p>
                </div>
              </section>
            </div>

            <div className="mt-12 pt-8 border-t border-gray-200">
              <Link href="/" className="text-blue-600 hover:text-blue-700 font-semibold">
                ← Back to Home
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

