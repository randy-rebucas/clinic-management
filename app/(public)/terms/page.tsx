import Link from 'next/link';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service - MyClinicSoft',
  description: 'MyClinicSoft Terms of Service - Read our terms and conditions.',
};

export default function TermsPage() {
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
            <h1 className="text-4xl sm:text-5xl font-extrabold text-gray-900 mb-4">Terms of Service</h1>
            <p className="text-gray-600 mb-8">Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>

            <div className="prose prose-lg max-w-none space-y-8">
              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">1. Agreement to Terms</h2>
                <p className="text-gray-700 leading-relaxed">
                  By accessing or using MyClinicSoft ("Service"), you agree to be bound by these Terms of Service. 
                  If you disagree with any part of these terms, you may not access the Service.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">2. Use License</h2>
                <p className="text-gray-700 leading-relaxed mb-4">
                  Permission is granted to use MyClinicSoft for your clinic management needs. This license does not include:
                </p>
                <ul className="list-disc pl-6 space-y-2 text-gray-700">
                  <li>Reselling or sublicensing the software</li>
                  <li>Reverse engineering or attempting to extract source code</li>
                  <li>Using the service for any illegal purpose</li>
                  <li>Removing copyright or proprietary notations</li>
                </ul>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">3. Account Registration</h2>
                <p className="text-gray-700 leading-relaxed mb-4">
                  To use MyClinicSoft, you must:
                </p>
                <ul className="list-disc pl-6 space-y-2 text-gray-700">
                  <li>Provide accurate and complete registration information</li>
                  <li>Maintain the security of your account credentials</li>
                  <li>Accept responsibility for all activities under your account</li>
                  <li>Notify us immediately of any unauthorized access</li>
                </ul>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">4. Subscription & Billing</h2>
                <h3 className="text-xl font-semibold text-gray-900 mb-3">4.1 Subscription Plans</h3>
                <p className="text-gray-700 leading-relaxed mb-4">
                  MyClinicSoft offers various subscription plans. By subscribing, you agree to pay the fees 
                  associated with your chosen plan.
                </p>
                <h3 className="text-xl font-semibold text-gray-900 mb-3">4.2 Billing</h3>
                <ul className="list-disc pl-6 space-y-2 text-gray-700 mb-4">
                  <li>Subscriptions are billed in advance on a monthly or annual basis</li>
                  <li>All fees are non-refundable except as required by law</li>
                  <li>We reserve the right to change pricing with 30 days notice</li>
                  <li>Failed payments may result in service suspension</li>
                </ul>
                <h3 className="text-xl font-semibold text-gray-900 mb-3">4.3 Refunds</h3>
                <p className="text-gray-700 leading-relaxed">
                  We offer a 30-day money-back guarantee. Refund requests must be made within 30 days of 
                  initial subscription purchase.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">5. Free Trial</h2>
                <p className="text-gray-700 leading-relaxed mb-4">
                  We offer a 7-day free trial. During the trial:
                </p>
                <ul className="list-disc pl-6 space-y-2 text-gray-700">
                  <li>You have full access to all features</li>
                  <li>No credit card required to start</li>
                  <li>Your data is preserved if you subscribe after trial</li>
                  <li>Service automatically expires after 7 days unless you subscribe</li>
                </ul>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">6. User Responsibilities</h2>
                <p className="text-gray-700 leading-relaxed mb-4">You agree to:</p>
                <ul className="list-disc pl-6 space-y-2 text-gray-700">
                  <li>Use the Service only for lawful purposes</li>
                  <li>Comply with all applicable healthcare regulations (HIPAA, PH DPA, etc.)</li>
                  <li>Maintain the confidentiality of patient data</li>
                  <li>Not transmit viruses or malicious code</li>
                  <li>Not interfere with or disrupt the Service</li>
                  <li>Not use the Service to violate any laws or regulations</li>
                </ul>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">7. Data & Content</h2>
                <h3 className="text-xl font-semibold text-gray-900 mb-3">7.1 Your Data</h3>
                <p className="text-gray-700 leading-relaxed mb-4">
                  You retain all rights to data you enter into MyClinicSoft. We do not claim ownership of your data.
                </p>
                <h3 className="text-xl font-semibold text-gray-900 mb-3">7.2 Data Backup</h3>
                <p className="text-gray-700 leading-relaxed mb-4">
                  While we maintain regular backups, you are responsible for maintaining your own backups of critical data.
                </p>
                <h3 className="text-xl font-semibold text-gray-900 mb-3">7.3 Data Deletion</h3>
                <p className="text-gray-700 leading-relaxed">
                  Upon account termination, your data will be deleted after 30 days. You may export your data 
                  before termination.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">8. Service Availability</h2>
                <p className="text-gray-700 leading-relaxed mb-4">
                  We strive for 99.9% uptime but do not guarantee uninterrupted service. We may:
                </p>
                <ul className="list-disc pl-6 space-y-2 text-gray-700">
                  <li>Perform scheduled maintenance with advance notice</li>
                  <li>Experience unscheduled downtime due to technical issues</li>
                  <li>Modify or discontinue features with reasonable notice</li>
                </ul>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">9. Intellectual Property</h2>
                <p className="text-gray-700 leading-relaxed">
                  MyClinicSoft and its original content, features, and functionality are owned by us and are 
                  protected by international copyright, trademark, and other intellectual property laws.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">10. Termination</h2>
                <p className="text-gray-700 leading-relaxed mb-4">
                  We may terminate or suspend your account immediately, without prior notice, for:
                </p>
                <ul className="list-disc pl-6 space-y-2 text-gray-700">
                  <li>Violation of these Terms of Service</li>
                  <li>Non-payment of fees</li>
                  <li>Fraudulent or illegal activity</li>
                  <li>Extended periods of inactivity</li>
                </ul>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">11. Limitation of Liability</h2>
                <p className="text-gray-700 leading-relaxed">
                  MyClinicSoft is provided "as is" without warranties. We shall not be liable for any indirect, 
                  incidental, special, or consequential damages arising from your use of the Service.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">12. Indemnification</h2>
                <p className="text-gray-700 leading-relaxed">
                  You agree to indemnify and hold harmless MyClinicSoft from any claims, damages, or expenses 
                  arising from your use of the Service or violation of these terms.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">13. Changes to Terms</h2>
                <p className="text-gray-700 leading-relaxed">
                  We reserve the right to modify these terms at any time. We will notify users of material 
                  changes via email or through the Service. Continued use after changes constitutes acceptance.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">14. Governing Law</h2>
                <p className="text-gray-700 leading-relaxed">
                  These Terms shall be governed by and construed in accordance with the laws of the jurisdiction 
                  in which MyClinicSoft operates, without regard to conflict of law provisions.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">15. Contact Information</h2>
                <p className="text-gray-700 leading-relaxed mb-4">
                  If you have questions about these Terms, please contact us:
                </p>
                <div className="bg-gray-50 rounded-xl p-4">
                  <p className="text-gray-700">
                    <strong>Email:</strong> <a href="mailto:legal@myclinicsoft.com" className="text-blue-600 hover:text-blue-700">legal@myclinicsoft.com</a><br />
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

