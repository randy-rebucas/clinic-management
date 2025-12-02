import Link from 'next/link';
import Image from 'next/image';
import { verifySession } from '@/app/lib/dal';
import { redirect } from 'next/navigation';

export default async function HomePage() {
  // Check if user is already logged in, redirect to dashboard
  const session = await verifySession();
  if (session) {
    redirect('/dashboard');
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      {/* Hero Section */}
      <section className="container mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24 lg:py-32">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          {/* Left Column - Text Content */}
          <div className="text-center lg:text-left">
            {/* Logo */}
            <div className="inline-flex items-center justify-center w-20 h-20 sm:w-24 sm:h-24 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-3xl shadow-xl mb-8 transform transition-transform hover:scale-105">
              <svg className="w-12 h-12 sm:w-16 sm:h-16 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
            </div>

            {/* Heading */}
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 mb-6 tracking-tight">
              Welcome to <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">ClinicHub</span>
            </h1>
            <p className="text-xl sm:text-2xl text-gray-600 mb-8 max-w-3xl mx-auto lg:mx-0">
              Your comprehensive healthcare management solution
            </p>
            <p className="text-lg text-gray-500 mb-12 max-w-2xl mx-auto lg:mx-0">
              Streamline patient care, manage appointments, and enhance your clinic's efficiency with our modern healthcare management platform.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start items-center mb-8">
              <Link
                href="/onboard"
                className="px-8 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-semibold text-lg shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200 w-full sm:w-auto"
              >
                Register as Patient
              </Link>
              <Link
                href="/book"
                className="px-8 py-4 bg-white text-blue-600 border-2 border-blue-600 rounded-xl font-semibold text-lg shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200 w-full sm:w-auto"
              >
                Book Appointment
              </Link>
              <Link
                href="/login"
                className="px-8 py-4 bg-gray-100 text-gray-700 rounded-xl font-semibold text-lg hover:bg-gray-200 transform hover:scale-105 transition-all duration-200 w-full sm:w-auto"
              >
                Staff Login
              </Link>
            </div>
          </div>

          {/* Right Column - Hero Image */}
          <div className="relative hidden lg:block">
            <div className="relative rounded-3xl overflow-hidden shadow-2xl w-full" style={{ height: '500px' }}>
              <Image
                src="https://images.unsplash.com/photo-1576091160550-2173dba999ef?w=800&h=600&fit=crop&q=80"
                alt="Modern healthcare clinic"
                fill
                style={{ objectFit: 'cover' }}
                className="rounded-3xl"
                priority
                sizes="(max-width: 1024px) 0px, 50vw"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-blue-900/20 to-transparent z-10 pointer-events-none"></div>
            </div>
            {/* Decorative elements */}
            <div className="absolute -top-4 -right-4 w-32 h-32 bg-blue-200 rounded-full opacity-20 blur-3xl z-0 pointer-events-none"></div>
            <div className="absolute -bottom-4 -left-4 w-40 h-40 bg-indigo-200 rounded-full opacity-20 blur-3xl z-0 pointer-events-none"></div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="bg-white py-16 sm:py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl sm:text-4xl font-bold text-center text-gray-900 mb-12">
            Why Choose ClinicHub?
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {/* Feature 1 */}
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-6 sm:p-8 shadow-lg hover:shadow-xl transition-shadow overflow-hidden relative">
              <div className="absolute top-0 right-0 w-32 h-32 opacity-10 relative">
                <Image
                  src="https://images.unsplash.com/photo-1559839734-2b71ea197c2c?w=200&h=200&fit=crop&q=80"
                  alt="Patient care"
                  fill
                  className="object-cover rounded-full"
                  sizes="128px"
                />
              </div>
              <div className="relative">
                <div className="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center mb-4">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">Patient Management</h3>
                <p className="text-gray-600">
                  Comprehensive patient records, medical history, and easy access to all patient information in one place.
                </p>
              </div>
            </div>

            {/* Feature 2 */}
            <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-2xl p-6 sm:p-8 shadow-lg hover:shadow-xl transition-shadow overflow-hidden relative">
              <div className="absolute top-0 right-0 w-32 h-32 opacity-10 relative">
                <Image
                  src="https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?w=200&h=200&fit=crop&q=80"
                  alt="Appointment scheduling"
                  fill
                  className="object-cover rounded-full"
                  sizes="128px"
                />
              </div>
              <div className="relative">
                <div className="w-12 h-12 bg-indigo-600 rounded-lg flex items-center justify-center mb-4">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">Appointment Scheduling</h3>
                <p className="text-gray-600">
                  Easy online booking system for patients and efficient scheduling management for staff.
                </p>
              </div>
            </div>

            {/* Feature 3 */}
            <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-2xl p-6 sm:p-8 shadow-lg hover:shadow-xl transition-shadow overflow-hidden relative">
              <div className="absolute top-0 right-0 w-32 h-32 opacity-10 relative">
                <Image
                  src="https://images.unsplash.com/photo-1450101499163-c8848c66ca85?w=200&h=200&fit=crop&q=80"
                  alt="Medical records"
                  fill
                  className="object-cover rounded-full"
                  sizes="128px"
                />
              </div>
              <div className="relative">
                <div className="w-12 h-12 bg-purple-600 rounded-lg flex items-center justify-center mb-4">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">Medical Records</h3>
                <p className="text-gray-600">
                  Secure storage and management of prescriptions, lab results, and medical documents.
                </p>
              </div>
            </div>

            {/* Feature 4 */}
            <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-2xl p-6 sm:p-8 shadow-lg hover:shadow-xl transition-shadow overflow-hidden relative">
              <div className="absolute top-0 right-0 w-32 h-32 opacity-10 relative">
                <Image
                  src="https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=200&h=200&fit=crop&q=80"
                  alt="Billing and invoicing"
                  fill
                  className="object-cover rounded-full"
                  sizes="128px"
                />
              </div>
              <div className="relative">
                <div className="w-12 h-12 bg-green-600 rounded-lg flex items-center justify-center mb-4">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">Billing & Invoicing</h3>
                <p className="text-gray-600">
                  Streamlined billing system with invoice generation, payment tracking, and financial reports.
                </p>
              </div>
            </div>

            {/* Feature 5 */}
            <div className="bg-gradient-to-br from-orange-50 to-red-50 rounded-2xl p-6 sm:p-8 shadow-lg hover:shadow-xl transition-shadow overflow-hidden relative">
              <div className="absolute top-0 right-0 w-32 h-32 opacity-10 relative">
                <Image
                  src="https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=200&h=200&fit=crop&q=80"
                  alt="Analytics and reports"
                  fill
                  className="object-cover rounded-full"
                  sizes="128px"
                />
              </div>
              <div className="relative">
                <div className="w-12 h-12 bg-orange-600 rounded-lg flex items-center justify-center mb-4">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">Analytics & Reports</h3>
                <p className="text-gray-600">
                  Comprehensive analytics and reporting tools to track clinic performance and patient trends.
                </p>
              </div>
            </div>

            {/* Feature 6 */}
            <div className="bg-gradient-to-br from-cyan-50 to-blue-50 rounded-2xl p-6 sm:p-8 shadow-lg hover:shadow-xl transition-shadow overflow-hidden relative">
              <div className="absolute top-0 right-0 w-32 h-32 opacity-10 relative">
                <Image
                  src="https://images.unsplash.com/photo-1563013544-824ae1b704d3?w=200&h=200&fit=crop&q=80"
                  alt="Security and compliance"
                  fill
                  className="object-cover rounded-full"
                  sizes="128px"
                />
              </div>
              <div className="relative">
                <div className="w-12 h-12 bg-cyan-600 rounded-lg flex items-center justify-center mb-4">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">Secure & Compliant</h3>
                <p className="text-gray-600">
                  HIPAA-compliant system with advanced security features to protect patient data and privacy.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Quick Links Section */}
      <section className="bg-gradient-to-br from-gray-50 to-blue-50 py-16 sm:py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl sm:text-4xl font-bold text-center text-gray-900 mb-12">
            Quick Access
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-4xl mx-auto">
            <Link
              href="/onboard"
              className="bg-white rounded-xl p-6 shadow-lg hover:shadow-xl transform hover:scale-105 transition-all text-center group"
            >
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mx-auto mb-4 group-hover:bg-blue-200 transition-colors">
                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                </svg>
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">New Patient</h3>
              <p className="text-sm text-gray-600">Register here</p>
            </Link>

            <Link
              href="/book"
              className="bg-white rounded-xl p-6 shadow-lg hover:shadow-xl transform hover:scale-105 transition-all text-center group"
            >
              <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center mx-auto mb-4 group-hover:bg-indigo-200 transition-colors">
                <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">Book Appointment</h3>
              <p className="text-sm text-gray-600">Schedule online</p>
            </Link>

            <Link
              href="/patient/login"
              className="bg-white rounded-xl p-6 shadow-lg hover:shadow-xl transform hover:scale-105 transition-all text-center group"
            >
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mx-auto mb-4 group-hover:bg-purple-200 transition-colors">
                <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">Patient Portal</h3>
              <p className="text-sm text-gray-600">Access your records</p>
            </Link>

            <Link
              href="/login"
              className="bg-white rounded-xl p-6 shadow-lg hover:shadow-xl transform hover:scale-105 transition-all text-center group"
            >
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mx-auto mb-4 group-hover:bg-green-200 transition-colors">
                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">Staff Login</h3>
              <p className="text-sm text-gray-600">Clinic management</p>
            </Link>
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section className="relative bg-gradient-to-br from-blue-600 to-indigo-700 py-16 sm:py-24 overflow-hidden">
        {/* Background Image */}
        <div className="absolute inset-0 opacity-10">
          <Image
            src="https://images.unsplash.com/photo-1576091160550-2173dba999ef?w=1920&h=1080&fit=crop&q=80"
            alt="Healthcare support"
            fill
            className="object-cover"
          />
        </div>
        {/* Decorative elements */}
        <div className="absolute top-0 left-0 w-64 h-64 bg-white rounded-full opacity-5 blur-3xl"></div>
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-white rounded-full opacity-5 blur-3xl"></div>
        
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-6">
            Need Help?
          </h2>
          <p className="text-lg text-blue-100 mb-8 max-w-2xl mx-auto">
            Our support team is here to assist you. Contact us for any questions or concerns.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <a
              href="mailto:support@clinichub.com"
              className="px-6 py-3 bg-white text-blue-600 rounded-lg font-medium hover:bg-blue-50 transition-colors shadow-lg"
            >
              Email Support
            </a>
            <a
              href="tel:+1234567890"
              className="px-6 py-3 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-400 transition-colors shadow-lg"
            >
              Call Us
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}

