import Link from 'next/link';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Testimonials - MyClinicSoft',
  description: 'See what healthcare providers are saying about MyClinicSoft.',
};

export default function TestimonialsPage() {
  const testimonials = [
    {
      name: 'Dr. Sarah Johnson',
      role: 'Family Medicine Physician',
      clinic: 'Johnson Family Clinic',
      image: 'https://images.unsplash.com/photo-1559839734-2b71ea197ec2?ixlib=rb-4.0.3&auto=format&fit=crop&w=200&h=200&q=80',
      quote: 'MyClinicSoft has transformed how we manage our clinic. The appointment scheduling alone has saved us hours every week, and the patient management system is incredibly intuitive.',
      rating: 5,
    },
    {
      name: 'Dr. Michael Chen',
      role: 'Pediatrician',
      clinic: 'Children\'s Health Center',
      image: 'https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?ixlib=rb-4.0.3&auto=format&fit=crop&w=200&h=200&q=80',
      quote: 'As a pediatric clinic, we handle a lot of patient records and appointments. MyClinicSoft makes it all so easy. The billing integration is seamless, and our staff loves how user-friendly it is.',
      rating: 5,
    },
    {
      name: 'Maria Rodriguez',
      role: 'Clinic Administrator',
      clinic: 'Community Health Clinic',
      image: 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1f?ixlib=rb-4.0.3&auto=format&fit=crop&w=200&h=200&q=80',
      quote: 'The reporting features are fantastic. We can now track our clinic\'s performance in real-time and make data-driven decisions. The support team is also very responsive.',
      rating: 5,
    },
    {
      name: 'Dr. James Wilson',
      role: 'Internal Medicine',
      clinic: 'Wilson Medical Group',
      image: 'https://images.unsplash.com/photo-1582750433449-648ed127bb54?ixlib=rb-4.0.3&auto=format&fit=crop&w=200&h=200&q=80',
      quote: 'We switched from another system and the migration was smooth. MyClinicSoft is more affordable and has better features. The prescription management with drug interaction checking is a lifesaver.',
      rating: 5,
    },
    {
      name: 'Dr. Emily Davis',
      role: 'Dermatologist',
      clinic: 'Davis Dermatology',
      image: 'https://images.unsplash.com/photo-1594824476966-48f8c2e0e8a3?ixlib=rb-4.0.3&auto=format&fit=crop&w=200&h=200&q=80',
      quote: 'The document management system is excellent. We can easily store and retrieve patient photos and documents. The security features give us peace of mind with sensitive patient data.',
      rating: 5,
    },
    {
      name: 'Robert Kim',
      role: 'Practice Manager',
      clinic: 'Metro Health Services',
      image: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?ixlib=rb-4.0.3&auto=format&fit=crop&w=200&h=200&q=80',
      quote: 'MyClinicSoft has streamlined our entire operation. From patient check-in to billing, everything is integrated. The queue management system has eliminated our waiting room chaos.',
      rating: 5,
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
              <span className="text-sm font-semibold text-blue-700">Testimonials</span>
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-gray-900 mb-6">
              What Our{' '}
              <span className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent">
                Customers Say
              </span>
            </h1>
            <p className="text-xl sm:text-2xl text-gray-700 max-w-3xl mx-auto leading-relaxed">
              Real feedback from healthcare providers using MyClinicSoft
            </p>
          </div>
        </div>
      </section>

      {/* Testimonials Grid */}
      <section className="relative py-12 sm:py-16 lg:py-20 px-4 sm:px-6 lg:px-8">
        <div className="container mx-auto max-w-7xl">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
            {testimonials.map((testimonial, index) => (
              <div
                key={index}
                className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 sm:p-8 shadow-lg hover:shadow-2xl transition-all duration-300 border border-gray-100/50 hover:border-blue-300"
              >
                <div className="flex items-center gap-1 mb-4">
                  {[...Array(testimonial.rating)].map((_, i) => (
                    <svg key={i} className="w-5 h-5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  ))}
                </div>
                <p className="text-gray-700 leading-relaxed mb-6 italic">"{testimonial.quote}"</p>
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-indigo-500 flex-shrink-0"></div>
                  <div>
                    <div className="font-semibold text-gray-900">{testimonial.name}</div>
                    <div className="text-sm text-gray-600">{testimonial.role}</div>
                    <div className="text-sm text-gray-500">{testimonial.clinic}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="relative py-12 sm:py-16 lg:py-20 px-4 sm:px-6 lg:px-8 bg-white/40 backdrop-blur-sm">
        <div className="container mx-auto max-w-7xl">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8">
            <div className="text-center bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-lg">
              <div className="text-4xl sm:text-5xl font-extrabold text-gray-900 mb-2">1000+</div>
              <div className="text-sm sm:text-base text-gray-600">Active Patients</div>
            </div>
            <div className="text-center bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-lg">
              <div className="text-4xl sm:text-5xl font-extrabold text-gray-900 mb-2">50+</div>
              <div className="text-sm sm:text-base text-gray-600">Clinics</div>
            </div>
            <div className="text-center bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-lg">
              <div className="text-4xl sm:text-5xl font-extrabold text-gray-900 mb-2">4.9/5</div>
              <div className="text-sm sm:text-base text-gray-600">Average Rating</div>
            </div>
            <div className="text-center bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-lg">
              <div className="text-4xl sm:text-5xl font-extrabold text-gray-900 mb-2">99.9%</div>
              <div className="text-sm sm:text-base text-gray-600">Uptime</div>
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
            Join Our Happy Customers
          </h2>
          <p className="text-base sm:text-lg lg:text-xl text-blue-100 mb-8 sm:mb-12 max-w-2xl mx-auto leading-relaxed">
            Start your free trial today and see why healthcare providers trust MyClinicSoft.
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

