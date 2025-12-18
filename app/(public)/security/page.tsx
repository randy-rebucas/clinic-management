import Link from 'next/link';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Security & Compliance - MyClinicSoft',
  description: 'Learn about MyClinicSoft security measures and compliance certifications.',
};

export default function SecurityPage() {
  const securityFeatures = [
    {
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
      ),
      title: 'Data Encryption',
      description: 'All data is encrypted in transit (SSL/TLS) and at rest using AES-256 encryption.',
    },
    {
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      ),
      title: 'Access Controls',
      description: 'Role-based access control ensures users only access data they\'re authorized to see.',
    },
    {
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
      title: 'Audit Logging',
      description: 'Comprehensive audit trails track all system activities and data access for compliance.',
    },
    {
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      ),
      title: 'Regular Security Audits',
      description: 'We conduct regular security assessments and penetration testing to identify and fix vulnerabilities.',
    },
    {
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
        </svg>
      ),
      title: 'Secure Data Centers',
      description: 'Data is stored in SOC 2 compliant data centers with physical security and redundancy.',
    },
    {
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
      ),
      title: 'Multi-Factor Authentication',
      description: 'Optional MFA adds an extra layer of security to protect your account from unauthorized access.',
    },
  ];

  const complianceStandards = [
    { name: 'HIPAA', description: 'Health Insurance Portability and Accountability Act compliance for US healthcare providers' },
    { name: 'PH DPA', description: 'Philippines Data Privacy Act compliance for clinics in the Philippines' },
    { name: 'GDPR', description: 'General Data Protection Regulation compliance for EU-based users' },
    { name: 'SOC 2', description: 'Service Organization Control 2 certified data centers' },
  ];

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Background */}
      <div className="fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50"></div>
        <div className="absolute top-0 -left-4 w-96 h-96 bg-blue-400 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob"></div>
        <div className="absolute top-0 -right-4 w-96 h-96 bg-purple-400 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob animation-delay-2000"></div>
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]"></div>
      </div>

      {/* Hero Section */}
      <section className="relative pt-24 sm:pt-32 pb-12 sm:pb-16 px-4 sm:px-6 lg:px-8">
        <div className="container mx-auto max-w-7xl">
          <div className="text-center mb-12">
            <div className="inline-block px-4 py-2 bg-blue-100 rounded-full mb-4">
              <span className="text-sm font-semibold text-blue-700">Security</span>
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-gray-900 mb-6">
              Security &{' '}
              <span className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent">
                Compliance
              </span>
            </h1>
            <p className="text-xl sm:text-2xl text-gray-700 max-w-3xl mx-auto leading-relaxed">
              Enterprise-grade security to protect your clinic and patient data
            </p>
          </div>
        </div>
      </section>

      {/* Security Features */}
      <section className="relative py-12 sm:py-16 lg:py-20 px-4 sm:px-6 lg:px-8">
        <div className="container mx-auto max-w-7xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-4">Security Features</h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Multiple layers of protection to keep your data safe
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
            {securityFeatures.map((feature, index) => (
              <div
                key={index}
                className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 sm:p-8 shadow-lg hover:shadow-2xl transition-all duration-300 border border-gray-100/50 hover:border-blue-300 hover:-translate-y-1"
              >
                <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-500 rounded-xl flex items-center justify-center mb-4 text-white">
                  {feature.icon}
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">{feature.title}</h3>
                <p className="text-gray-600 leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Compliance Section */}
      <section className="relative py-12 sm:py-16 lg:py-20 px-4 sm:px-6 lg:px-8 bg-white/40 backdrop-blur-sm">
        <div className="container mx-auto max-w-7xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-4">Compliance Standards</h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              We meet the highest standards for healthcare data protection
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8">
            {complianceStandards.map((standard, index) => (
              <div
                key={index}
                className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 sm:p-8 shadow-lg"
              >
                <h3 className="text-2xl font-bold text-gray-900 mb-3">{standard.name}</h3>
                <p className="text-gray-600 leading-relaxed">{standard.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Data Protection Section */}
      <section className="relative py-12 sm:py-16 lg:py-20 px-4 sm:px-6 lg:px-8">
        <div className="container mx-auto max-w-4xl">
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 sm:p-8 lg:p-12 shadow-lg">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-6">Data Protection</h2>
            <div className="space-y-6 text-gray-700">
              <div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">Encryption</h3>
                <p className="leading-relaxed">
                  All data transmitted between your device and our servers is encrypted using TLS 1.3. 
                  Data at rest is encrypted using AES-256 encryption, the same standard used by banks and government agencies.
                </p>
              </div>
              <div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">Access Controls</h3>
                <p className="leading-relaxed">
                  Role-based access control ensures that only authorized personnel can access sensitive patient data. 
                  You can customize permissions for different staff members based on their roles.
                </p>
              </div>
              <div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">Backup & Recovery</h3>
                <p className="leading-relaxed">
                  Your data is automatically backed up daily with point-in-time recovery capabilities. 
                  Backups are stored in geographically distributed data centers for redundancy.
                </p>
              </div>
              <div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">Incident Response</h3>
                <p className="leading-relaxed">
                  We have a dedicated security team that monitors for threats 24/7 and responds immediately 
                  to any security incidents. We also conduct regular security audits and penetration testing.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700 py-16 sm:py-20 lg:py-24 px-4 sm:px-6 lg:px-8 overflow-hidden">
        <div className="absolute inset-0">
          <div className="absolute top-0 left-0 w-96 h-96 bg-white/10 rounded-full blur-3xl"></div>
          <div className="absolute bottom-0 right-0 w-96 h-96 bg-white/10 rounded-full blur-3xl"></div>
        </div>
        <div className="container mx-auto max-w-4xl text-center relative z-10">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white mb-4 sm:mb-6">
            Questions About Security?
          </h2>
          <p className="text-base sm:text-lg lg:text-xl text-blue-100 mb-8 sm:mb-12 max-w-2xl mx-auto leading-relaxed">
            Our security team is available to answer any questions about our security measures and compliance.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Link
              href="/contact"
              className="group px-6 sm:px-8 py-3 sm:py-4 bg-white text-blue-600 rounded-xl sm:rounded-2xl font-semibold hover:bg-blue-50 transition-all shadow-xl hover:shadow-2xl hover:scale-105 flex items-center gap-2 text-sm sm:text-base"
            >
              Contact Security Team
              <svg className="w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
            <Link
              href="/privacy"
              className="px-6 sm:px-8 py-3 sm:py-4 bg-blue-500/90 backdrop-blur-sm text-white rounded-xl sm:rounded-2xl font-semibold hover:bg-blue-400 transition-all shadow-xl hover:shadow-2xl hover:scale-105 flex items-center gap-2 text-sm sm:text-base"
            >
              View Privacy Policy
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

