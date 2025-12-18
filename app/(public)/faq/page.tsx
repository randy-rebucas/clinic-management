import Link from 'next/link';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'FAQ - MyClinicSoft',
  description: 'Frequently asked questions about MyClinicSoft clinic management system.',
};

export default function FAQPage() {
  const faqCategories = [
    {
      title: 'General',
      questions: [
        {
          q: 'What is MyClinicSoft?',
          a: 'MyClinicSoft is a comprehensive clinic management system designed to help healthcare providers manage patients, appointments, billing, prescriptions, and more in one integrated platform.',
        },
        {
          q: 'Do I need technical knowledge to use MyClinicSoft?',
          a: 'No, MyClinicSoft is designed to be user-friendly and intuitive. Our interface is built for healthcare professionals, not IT experts. We also provide comprehensive documentation and support.',
        },
        {
          q: 'Is MyClinicSoft cloud-based?',
          a: 'Yes, MyClinicSoft is a cloud-based solution, which means you can access it from anywhere with an internet connection. No installation or server maintenance required.',
        },
        {
          q: 'Can I try MyClinicSoft before purchasing?',
          a: 'Yes! We offer a 7-day free trial with full access to all features. No credit card required to start your trial.',
        },
      ],
    },
    {
      title: 'Pricing & Billing',
      questions: [
        {
          q: 'What payment methods do you accept?',
          a: 'We accept all major credit cards (Visa, MasterCard, American Express) and PayPal. Enterprise customers can also pay via invoice.',
        },
        {
          q: 'Can I change my plan later?',
          a: 'Yes, you can upgrade or downgrade your plan at any time. Changes take effect immediately, and we\'ll prorate any charges or credits.',
        },
        {
          q: 'Do you offer refunds?',
          a: 'Yes, we offer a 30-day money-back guarantee on all paid plans. If you\'re not satisfied, contact us within 30 days for a full refund.',
        },
        {
          q: 'Are there any hidden fees?',
          a: 'No hidden fees. The price you see is the price you pay. The only additional costs would be for optional add-ons like SMS credits or additional storage if you exceed your plan limits.',
        },
        {
          q: 'Do you offer discounts for annual plans?',
          a: 'Yes! Annual plans save you 17% compared to monthly billing. That\'s 2 months free when you pay annually.',
        },
      ],
    },
    {
      title: 'Features & Functionality',
      questions: [
        {
          q: 'What features are included in the Basic plan?',
          a: 'The Basic plan includes all core features: patient management, appointment scheduling, visit management, prescriptions, lab results, billing, inventory, and basic reporting. Perfect for small clinics with 1-3 doctors.',
        },
        {
          q: 'Can I customize MyClinicSoft for my clinic?',
          a: 'Yes, Professional and Enterprise plans offer customization options including custom reports, API access, and integrations. Enterprise plans also include white-label options.',
        },
        {
          q: 'Does MyClinicSoft support multiple locations?',
          a: 'Multi-location support is available in Professional and Enterprise plans. You can manage multiple clinic locations from a single account.',
        },
        {
          q: 'Can patients book appointments online?',
          a: 'Yes! MyClinicSoft includes a public booking system that allows patients to book appointments online 24/7. You can customize availability and appointment types.',
        },
        {
          q: 'Does MyClinicSoft integrate with lab systems?',
          a: 'Yes, MyClinicSoft supports third-party lab integrations and can receive lab results automatically. Professional and Enterprise plans include API access for custom integrations.',
        },
      ],
    },
    {
      title: 'Security & Compliance',
      questions: [
        {
          q: 'Is MyClinicSoft HIPAA compliant?',
          a: 'Yes, MyClinicSoft is built with HIPAA compliance in mind. We use enterprise-grade encryption, access controls, and maintain comprehensive audit logs. We also comply with PH DPA (Philippines Data Privacy Act) requirements.',
        },
        {
          q: 'How is patient data protected?',
          a: 'Patient data is encrypted both in transit (SSL/TLS) and at rest. We use role-based access controls, regular security audits, and maintain detailed audit trails of all data access.',
        },
        {
          q: 'Where is my data stored?',
          a: 'Your data is stored in secure, SOC 2 compliant data centers with redundant backups. Data is stored in the region closest to your clinic for optimal performance and compliance.',
        },
        {
          q: 'Can I export my data?',
          a: 'Yes, you can export your data at any time. Basic plans include standard data export, while Professional and Enterprise plans include bulk export capabilities.',
        },
      ],
    },
    {
      title: 'Support & Training',
      questions: [
        {
          q: 'What kind of support do you offer?',
          a: 'All plans include email support. Professional plans include priority support, and Enterprise plans include 24/7 support with a dedicated account manager.',
        },
        {
          q: 'Do you provide training?',
          a: 'Yes, we provide comprehensive documentation, video tutorials, and knowledge base articles. Enterprise customers receive personalized training sessions.',
        },
        {
          q: 'How quickly do you respond to support requests?',
          a: 'Response times vary by plan: Basic (24-48 hours), Professional (4-8 hours), Enterprise (1-2 hours or immediate for critical issues).',
        },
        {
          q: 'Is there a knowledge base or documentation?',
          a: 'Yes, we maintain a comprehensive knowledge base with articles, tutorials, and guides. You can access it at any time from your account or our public resources page.',
        },
      ],
    },
    {
      title: 'Setup & Migration',
      questions: [
        {
          q: 'How long does it take to set up MyClinicSoft?',
          a: 'You can start using MyClinicSoft immediately after signing up. Basic setup takes just a few minutes. Full implementation with data migration typically takes 1-2 weeks.',
        },
        {
          q: 'Can I import data from my current system?',
          a: 'Yes, we support data import from common formats (CSV, Excel). Enterprise customers can work with our team for custom data migration from other systems.',
        },
        {
          q: 'What happens to my data if I cancel?',
          a: 'You can export all your data before cancellation. After cancellation, your data is retained for 30 days, then permanently deleted according to our data retention policy.',
        },
      ],
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
              <span className="text-sm font-semibold text-blue-700">FAQ</span>
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-gray-900 mb-6">
              Frequently Asked{' '}
              <span className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent">
                Questions
              </span>
            </h1>
            <p className="text-xl sm:text-2xl text-gray-700 max-w-3xl mx-auto leading-relaxed">
              Find answers to common questions about MyClinicSoft
            </p>
          </div>
        </div>
      </section>

      {/* FAQ Sections */}
      <section className="relative py-12 sm:py-16 lg:py-20 px-4 sm:px-6 lg:px-8">
        <div className="container mx-auto max-w-5xl">
          <div className="space-y-12">
            {faqCategories.map((category, categoryIndex) => (
              <div key={categoryIndex} className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 sm:p-8 shadow-lg">
                <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-6">{category.title}</h2>
                <div className="space-y-4">
                  {category.questions.map((item, itemIndex) => (
                    <div key={itemIndex} className="border-b border-gray-200 last:border-0 pb-4 last:pb-0">
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">{item.q}</h3>
                      <p className="text-gray-600 leading-relaxed">{item.a}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Still Have Questions Section */}
      <section className="relative py-12 sm:py-16 lg:py-20 px-4 sm:px-6 lg:px-8 bg-white/40 backdrop-blur-sm">
        <div className="container mx-auto max-w-4xl text-center">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-4">
            Still Have Questions?
          </h2>
          <p className="text-lg text-gray-600 mb-8">
            Can't find what you're looking for? Our support team is here to help.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/contact"
              className="px-6 sm:px-8 py-3 sm:py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-semibold hover:from-blue-700 hover:to-indigo-700 transition-all shadow-lg hover:shadow-xl transform hover:scale-105"
            >
              Contact Support
            </Link>
            <Link
              href="/support"
              className="px-6 sm:px-8 py-3 sm:py-4 bg-white text-blue-600 border-2 border-blue-600 rounded-xl font-semibold hover:bg-blue-50 transition-all shadow-lg hover:shadow-xl transform hover:scale-105"
            >
              Visit Help Center
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

