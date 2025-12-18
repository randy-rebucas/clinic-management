import Link from 'next/link';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Pricing - MyClinicSoft',
  description: 'Choose the perfect plan for your clinic. Flexible pricing options from small practices to large healthcare facilities.',
};

export default function PricingPage() {
  const plans = [
    {
      name: 'Trial',
      price: 0,
      period: '7 days',
      description: 'Perfect for testing the system',
      features: [
        'Up to 50 patients',
        'Up to 3 users',
        'Up to 2 doctors',
        '100 appointments/month',
        '1 GB storage',
        'Basic features',
        'Email support',
      ],
      limitations: [
        'No advanced reporting',
        'No API access',
        'Limited to 7 days',
      ],
      cta: 'Start Free Trial',
      ctaLink: '/tenant-onboard',
      popular: false,
      color: 'gray',
    },
    {
      name: 'Basic',
      price: 29,
      period: 'month',
      yearlyPrice: 290,
      description: 'Perfect for small clinics (1-3 doctors)',
      features: [
        'Up to 100 patients',
        'Up to 5 users',
        'Up to 3 doctors',
        '500 appointments/month',
        '5 GB storage',
        'All core features',
        'Basic reporting',
        'Email support',
        'Automated backups',
      ],
      limitations: [],
      cta: 'Get Started',
      ctaLink: '/tenant-onboard',
      popular: true,
      color: 'blue',
    },
    {
      name: 'Professional',
      price: 79,
      period: 'month',
      yearlyPrice: 790,
      description: 'Perfect for medium clinics (4-10 doctors)',
      features: [
        'Up to 500 patients',
        'Up to 15 users',
        'Up to 10 doctors',
        '2,000 appointments/month',
        '20 GB storage',
        'All features',
        'Custom reports',
        'API access',
        'Webhooks',
        'Priority support',
      ],
      limitations: [],
      cta: 'Get Started',
      ctaLink: '/tenant-onboard',
      popular: false,
      color: 'indigo',
    },
    {
      name: 'Enterprise',
      price: 199,
      period: 'month',
      yearlyPrice: 1990,
      description: 'Perfect for large clinics (10+ doctors)',
      features: [
        'Unlimited patients',
        'Unlimited users',
        'Unlimited doctors',
        'Unlimited appointments',
        'Unlimited storage',
        'All features',
        'White-label option',
        'SSO integration',
        'Custom integrations',
        '24/7 support',
        'Dedicated account manager',
      ],
      limitations: [],
      cta: 'Contact Sales',
      ctaLink: '/contact',
      popular: false,
      color: 'purple',
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
              <span className="text-sm font-semibold text-blue-700">Pricing</span>
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-gray-900 mb-6">
              Simple, Transparent{' '}
              <span className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent">
                Pricing
              </span>
            </h1>
            <p className="text-xl sm:text-2xl text-gray-700 max-w-3xl mx-auto leading-relaxed">
              Choose the perfect plan for your clinic. All plans include a 7-day free trial.
            </p>
          </div>
        </div>
      </section>

      {/* Pricing Cards */}
      <section className="relative py-12 sm:py-16 lg:py-20 px-4 sm:px-6 lg:px-8">
        <div className="container mx-auto max-w-7xl">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8">
            {plans.map((plan, index) => (
              <div
                key={index}
                className={`relative bg-white/80 backdrop-blur-sm rounded-2xl p-6 sm:p-8 shadow-lg hover:shadow-2xl transition-all duration-300 border-2 ${
                  plan.popular
                    ? 'border-blue-500 scale-105 lg:scale-110'
                    : 'border-gray-100/50 hover:border-blue-300'
                } hover:-translate-y-1`}
              >
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                    <span className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-4 py-1 rounded-full text-sm font-semibold shadow-lg">
                      Most Popular
                    </span>
                  </div>
                )}
                
                <div className="text-center mb-6">
                  <h3 className="text-2xl font-bold text-gray-900 mb-2">{plan.name}</h3>
                  <p className="text-sm text-gray-600 mb-4">{plan.description}</p>
                  <div className="mb-4">
                    <span className="text-4xl sm:text-5xl font-extrabold text-gray-900">
                      ${plan.price}
                    </span>
                    {plan.price > 0 && (
                      <>
                        <span className="text-gray-600 text-lg">/{plan.period}</span>
                        {plan.yearlyPrice && (
                          <div className="text-sm text-gray-500 mt-1">
                            ${plan.yearlyPrice}/year
                            <span className="text-green-600 ml-1">(Save 17%)</span>
                          </div>
                        )}
                      </>
                    )}
                    {plan.price === 0 && (
                      <span className="text-gray-600 text-lg">/{plan.period}</span>
                    )}
                  </div>
                </div>

                <Link
                  href={plan.ctaLink}
                  className={`block w-full text-center px-6 py-3 rounded-xl font-semibold transition-all shadow-lg hover:shadow-xl transform hover:scale-105 mb-6 ${
                    plan.popular
                      ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-700 hover:to-indigo-700'
                      : plan.color === 'gray'
                      ? 'bg-gray-600 text-white hover:bg-gray-700'
                      : 'bg-white text-blue-600 border-2 border-blue-600 hover:bg-blue-50'
                  }`}
                >
                  {plan.cta}
                </Link>

                <ul className="space-y-3 mb-6">
                  {plan.features.map((feature, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-sm text-gray-700">
                      <svg className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span>{feature}</span>
                    </li>
                  ))}
                  {plan.limitations.length > 0 && (
                    <>
                      {plan.limitations.map((limitation, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-sm text-gray-500">
                          <svg className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                          <span>{limitation}</span>
                        </li>
                      ))}
                    </>
                  )}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="relative py-12 sm:py-16 lg:py-20 px-4 sm:px-6 lg:px-8 bg-white/40 backdrop-blur-sm">
        <div className="container mx-auto max-w-4xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-4">
              Frequently Asked Questions
            </h2>
          </div>
          <div className="space-y-6">
            <div className="bg-white/80 backdrop-blur-sm rounded-xl p-6 shadow-lg">
              <h3 className="text-lg font-bold text-gray-900 mb-2">Can I change plans later?</h3>
              <p className="text-gray-600">Yes, you can upgrade or downgrade your plan at any time. Changes take effect immediately.</p>
            </div>
            <div className="bg-white/80 backdrop-blur-sm rounded-xl p-6 shadow-lg">
              <h3 className="text-lg font-bold text-gray-900 mb-2">What happens after the trial?</h3>
              <p className="text-gray-600">After your 7-day trial, you'll need to choose a paid plan to continue using MyClinicSoft. Your data is preserved during the transition.</p>
            </div>
            <div className="bg-white/80 backdrop-blur-sm rounded-xl p-6 shadow-lg">
              <h3 className="text-lg font-bold text-gray-900 mb-2">Do you offer refunds?</h3>
              <p className="text-gray-600">We offer a 30-day money-back guarantee on all paid plans. Contact support for assistance.</p>
            </div>
            <div className="bg-white/80 backdrop-blur-sm rounded-xl p-6 shadow-lg">
              <h3 className="text-lg font-bold text-gray-900 mb-2">Is there a setup fee?</h3>
              <p className="text-gray-600">No, there are no setup fees. You only pay the monthly or yearly subscription fee.</p>
            </div>
          </div>
          <div className="text-center mt-8">
            <Link href="/faq" className="text-blue-600 hover:text-blue-700 font-semibold">
              View all FAQs →
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
            Ready to Get Started?
          </h2>
          <p className="text-base sm:text-lg lg:text-xl text-blue-100 mb-8 sm:mb-12 max-w-2xl mx-auto leading-relaxed">
            Start your free 7-day trial today. No credit card required.
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

