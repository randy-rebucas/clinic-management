import Link from 'next/link';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Resources - MyClinicSoft',
  description: 'Helpful resources, documentation, and guides for MyClinicSoft users.',
};

export default function ResourcesPage() {
  const resources = [
    {
      category: 'Documentation',
      items: [
        { title: 'Getting Started Guide', description: 'Step-by-step guide to set up your clinic', link: '/knowledge-base' },
        { title: 'User Manual', description: 'Complete user manual for all features', link: '/knowledge-base' },
        { title: 'API Documentation', description: 'Technical documentation for API integration', link: '/knowledge-base' },
        { title: 'Feature Guides', description: 'Detailed guides for each feature', link: '/knowledge-base' },
      ],
    },
    {
      category: 'Video Tutorials',
      items: [
        { title: 'Quick Start Video', description: '5-minute overview of MyClinicSoft', link: '#' },
        { title: 'Patient Management Tutorial', description: 'Learn how to manage patients effectively', link: '#' },
        { title: 'Appointment Scheduling', description: 'Master the appointment system', link: '#' },
        { title: 'Billing & Invoicing', description: 'Complete billing workflow tutorial', link: '#' },
      ],
    },
    {
      category: 'Downloadable Guides',
      items: [
        { title: 'Implementation Checklist', description: 'PDF checklist for clinic setup', link: '#' },
        { title: 'Best Practices Guide', description: 'Healthcare management best practices', link: '#' },
        { title: 'Security Checklist', description: 'Security best practices for clinics', link: '#' },
        { title: 'Compliance Guide', description: 'HIPAA and PH DPA compliance guide', link: '#' },
      ],
    },
    {
      category: 'Webinars',
      items: [
        { title: 'Introduction to MyClinicSoft', description: 'Recorded webinar for new users', link: '#' },
        { title: 'Advanced Features', description: 'Deep dive into advanced functionality', link: '#' },
        { title: 'Data Migration', description: 'How to migrate from other systems', link: '#' },
        { title: 'Q&A Session', description: 'Monthly Q&A with our team', link: '#' },
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
              <span className="text-sm font-semibold text-blue-700">Resources</span>
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-gray-900 mb-6">
              Helpful{' '}
              <span className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent">
                Resources
              </span>
            </h1>
            <p className="text-xl sm:text-2xl text-gray-700 max-w-3xl mx-auto leading-relaxed">
              Everything you need to get the most out of MyClinicSoft
            </p>
          </div>
        </div>
      </section>

      {/* Resources Grid */}
      <section className="relative py-12 sm:py-16 lg:py-20 px-4 sm:px-6 lg:px-8">
        <div className="container mx-auto max-w-7xl">
          <div className="space-y-12">
            {resources.map((category, categoryIndex) => (
              <div key={categoryIndex}>
                <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-6">{category.category}</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  {category.items.map((item, itemIndex) => (
                    <Link
                      key={itemIndex}
                      href={item.link}
                      className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-lg hover:shadow-2xl transition-all duration-300 border border-gray-100/50 hover:border-blue-300 hover:-translate-y-1"
                    >
                      <h3 className="text-lg font-bold text-gray-900 mb-2">{item.title}</h3>
                      <p className="text-gray-600 text-sm leading-relaxed">{item.description}</p>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
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
            Need More Help?
          </h2>
          <p className="text-base sm:text-lg lg:text-xl text-blue-100 mb-8 sm:mb-12 max-w-2xl mx-auto leading-relaxed">
            Our support team is ready to assist you with any questions.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Link
              href="/support"
              className="group px-6 sm:px-8 py-3 sm:py-4 bg-white text-blue-600 rounded-xl sm:rounded-2xl font-semibold hover:bg-blue-50 transition-all shadow-xl hover:shadow-2xl hover:scale-105 flex items-center gap-2 text-sm sm:text-base"
            >
              Visit Support Center
              <svg className="w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
            <Link
              href="/contact"
              className="px-6 sm:px-8 py-3 sm:py-4 bg-blue-500/90 backdrop-blur-sm text-white rounded-xl sm:rounded-2xl font-semibold hover:bg-blue-400 transition-all shadow-xl hover:shadow-2xl hover:scale-105 flex items-center gap-2 text-sm sm:text-base"
            >
              Contact Support
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

