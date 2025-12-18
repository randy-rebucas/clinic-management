import Link from 'next/link';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Integrations - MyClinicSoft',
  description: 'Connect MyClinicSoft with your favorite tools and services.',
};

export default function IntegrationsPage() {
  const integrations = [
    {
      name: 'Twilio',
      category: 'SMS',
      description: 'Send automated SMS reminders and notifications to patients',
      icon: '📱',
      status: 'Available',
    },
    {
      name: 'Cloudinary',
      category: 'Storage',
      description: 'Secure document and image storage with automatic optimization',
      icon: '☁️',
      status: 'Available',
    },
    {
      name: 'PayPal',
      category: 'Payment',
      description: 'Accept online payments and manage subscriptions',
      icon: '💳',
      status: 'Available',
    },
    {
      name: 'Lab Systems',
      category: 'Healthcare',
      description: 'Integrate with third-party laboratory systems for automated results',
      icon: '🧪',
      status: 'Available',
    },
    {
      name: 'Email (SMTP)',
      category: 'Communication',
      description: 'Send automated emails for appointments, invoices, and notifications',
      icon: '✉️',
      status: 'Available',
    },
    {
      name: 'API Access',
      category: 'Development',
      description: 'RESTful API for custom integrations and automation',
      icon: '🔌',
      status: 'Professional+',
    },
    {
      name: 'Webhooks',
      category: 'Development',
      description: 'Real-time event notifications to your systems',
      icon: '🔔',
      status: 'Professional+',
    },
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
              <span className="text-sm font-semibold text-blue-700">Integrations</span>
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-gray-900 mb-6">
              Connect with{' '}
              <span className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent">
                Your Tools
              </span>
            </h1>
            <p className="text-xl sm:text-2xl text-gray-700 max-w-3xl mx-auto leading-relaxed">
              Integrate MyClinicSoft with the services you already use
            </p>
          </div>
        </div>
      </section>

      {/* Integrations Grid */}
      <section className="relative py-12 sm:py-16 lg:py-20 px-4 sm:px-6 lg:px-8">
        <div className="container mx-auto max-w-7xl">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
            {integrations.map((integration, index) => (
              <div
                key={index}
                className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 sm:p-8 shadow-lg hover:shadow-2xl transition-all duration-300 border border-gray-100/50 hover:border-blue-300 hover:-translate-y-1"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="text-4xl">{integration.icon}</div>
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                    integration.status === 'Available'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-blue-100 text-blue-700'
                  }`}>
                    {integration.status}
                  </span>
                </div>
                <div className="mb-2">
                  <span className="text-xs font-semibold text-blue-600 uppercase">{integration.category}</span>
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">{integration.name}</h3>
                <p className="text-gray-600 leading-relaxed">{integration.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* API Section */}
      <section className="relative py-12 sm:py-16 lg:py-20 px-4 sm:px-6 lg:px-8 bg-white/40 backdrop-blur-sm">
        <div className="container mx-auto max-w-4xl">
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 sm:p-8 lg:p-12 shadow-lg">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-6">API & Custom Integrations</h2>
            <p className="text-lg text-gray-700 mb-6 leading-relaxed">
              Professional and Enterprise plans include full API access and webhook support, allowing you to 
              build custom integrations with any system.
            </p>
            <div className="space-y-4 mb-8">
              <div className="flex items-start gap-3">
                <svg className="w-6 h-6 text-green-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <div>
                  <h3 className="font-semibold text-gray-900 mb-1">RESTful API</h3>
                  <p className="text-gray-600">Comprehensive API for all MyClinicSoft features</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <svg className="w-6 h-6 text-green-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <div>
                  <h3 className="font-semibold text-gray-900 mb-1">Webhooks</h3>
                  <p className="text-gray-600">Real-time event notifications to your systems</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <svg className="w-6 h-6 text-green-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <div>
                  <h3 className="font-semibold text-gray-900 mb-1">Documentation</h3>
                  <p className="text-gray-600">Comprehensive API documentation and examples</p>
                </div>
              </div>
            </div>
            <Link
              href="/knowledge-base"
              className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-semibold hover:from-blue-700 hover:to-indigo-700 transition-all shadow-lg hover:shadow-xl"
            >
              View API Documentation
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
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
            Need a Custom Integration?
          </h2>
          <p className="text-base sm:text-lg lg:text-xl text-blue-100 mb-8 sm:mb-12 max-w-2xl mx-auto leading-relaxed">
            Enterprise customers can work with our team to build custom integrations tailored to your needs.
          </p>
          <Link
            href="/contact"
            className="inline-flex items-center gap-2 px-6 sm:px-8 py-3 sm:py-4 bg-white text-blue-600 rounded-xl sm:rounded-2xl font-semibold hover:bg-blue-50 transition-all shadow-xl hover:shadow-2xl hover:scale-105 text-sm sm:text-base"
          >
            Contact Sales
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </Link>
        </div>
      </section>
    </div>
  );
}

