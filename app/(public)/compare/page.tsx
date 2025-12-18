import Link from 'next/link';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Compare - MyClinicSoft',
  description: 'See how MyClinicSoft compares to other clinic management solutions.',
};

export default function ComparePage() {
  const features = [
    { feature: 'Patient Management', myclinicsoft: true, competitor: true },
    { feature: 'Appointment Scheduling', myclinicsoft: true, competitor: true },
    { feature: 'E-Prescriptions', myclinicsoft: true, competitor: true },
    { feature: 'Lab Results Management', myclinicsoft: true, competitor: true },
    { feature: 'Billing & Invoicing', myclinicsoft: true, competitor: true },
    { feature: 'Queue Management', myclinicsoft: true, competitor: false },
    { feature: 'Drug Interaction Checking', myclinicsoft: true, competitor: false },
    { feature: 'ICD-10 Diagnosis Coding', myclinicsoft: true, competitor: true },
    { feature: 'Membership & Loyalty Programs', myclinicsoft: true, competitor: false },
    { feature: 'Public Booking Portal', myclinicsoft: true, competitor: true },
    { feature: 'SMS Integration', myclinicsoft: true, competitor: 'Add-on' },
    { feature: 'API Access', myclinicsoft: 'Professional+', competitor: 'Enterprise only' },
    { feature: 'Custom Reports', myclinicsoft: 'Professional+', competitor: 'Enterprise only' },
    { feature: 'Multi-Location Support', myclinicsoft: 'Professional+', competitor: 'Enterprise only' },
    { feature: 'Starting Price', myclinicsoft: '$29/month', competitor: '$49/month' },
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
              <span className="text-sm font-semibold text-blue-700">Compare</span>
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-gray-900 mb-6">
              Why Choose{' '}
              <span className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent">
                MyClinicSoft?
              </span>
            </h1>
            <p className="text-xl sm:text-2xl text-gray-700 max-w-3xl mx-auto leading-relaxed">
              See how we stack up against the competition
            </p>
          </div>
        </div>
      </section>

      {/* Comparison Table */}
      <section className="relative py-12 sm:py-16 lg:py-20 px-4 sm:px-6 lg:px-8">
        <div className="container mx-auto max-w-7xl">
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
                  <tr>
                    <th className="px-6 py-4 text-left font-semibold">Feature</th>
                    <th className="px-6 py-4 text-center font-semibold">MyClinicSoft</th>
                    <th className="px-6 py-4 text-center font-semibold">Competitor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {features.map((item, index) => (
                    <tr key={index} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 font-medium text-gray-900">{item.feature}</td>
                      <td className="px-6 py-4 text-center">
                        {item.myclinicsoft === true ? (
                          <svg className="w-6 h-6 text-green-600 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : typeof item.myclinicsoft === 'string' ? (
                          <span className="text-blue-600 font-semibold">{item.myclinicsoft}</span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-center">
                        {item.competitor === true ? (
                          <svg className="w-6 h-6 text-green-600 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : typeof item.competitor === 'string' ? (
                          <span className="text-gray-600">{item.competitor}</span>
                        ) : (
                          <svg className="w-6 h-6 text-red-500 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* Why Choose Us */}
      <section className="relative py-12 sm:py-16 lg:py-20 px-4 sm:px-6 lg:px-8 bg-white/40 backdrop-blur-sm">
        <div className="container mx-auto max-w-7xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-4">Why Choose MyClinicSoft?</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-lg">
              <h3 className="text-xl font-bold text-gray-900 mb-3">Better Value</h3>
              <p className="text-gray-600">
                More features at a lower price. Starting at $29/month compared to $49/month for competitors.
              </p>
            </div>
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-lg">
              <h3 className="text-xl font-bold text-gray-900 mb-3">More Features</h3>
              <p className="text-gray-600">
                Unique features like queue management, drug interaction checking, and membership programs.
              </p>
            </div>
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-lg">
              <h3 className="text-xl font-bold text-gray-900 mb-3">Better Support</h3>
              <p className="text-gray-600">
                Responsive support team and comprehensive documentation. Enterprise plans include 24/7 support.
              </p>
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
            Ready to Make the Switch?
          </h2>
          <p className="text-base sm:text-lg lg:text-xl text-blue-100 mb-8 sm:mb-12 max-w-2xl mx-auto leading-relaxed">
            Start your free 7-day trial and experience the difference.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Link
              href="/tenant-onboard"
              className="group px-6 sm:px-8 py-3 sm:py-4 bg-white text-blue-600 rounded-xl sm:rounded-2xl font-semibold hover:bg-blue-50 transition-all shadow-xl hover:shadow-2xl hover:scale-105 flex items-center gap-2 text-sm sm:text-base"
            >
              Start Free Trial
              <svg className="w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
            <Link
              href="/contact"
              className="px-6 sm:px-8 py-3 sm:py-4 bg-blue-500/90 backdrop-blur-sm text-white rounded-xl sm:rounded-2xl font-semibold hover:bg-blue-400 transition-all shadow-xl hover:shadow-2xl hover:scale-105 flex items-center gap-2 text-sm sm:text-base"
            >
              Contact Sales
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

