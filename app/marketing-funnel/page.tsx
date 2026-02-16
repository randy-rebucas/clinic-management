import Image from "next/image";

export default function MarketingFunnelPage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 to-white flex flex-col items-center justify-center px-4 py-12">
      <section className="max-w-2xl w-full bg-white rounded-xl shadow-lg p-8 flex flex-col items-center">
        <Image src="/logo.png" alt="MyClinicSoft Logo" width={150} height={150} className="mb-4" />
        <h1 className="text-4xl font-bold text-blue-700 mb-2 text-center">Transform Your Clinic with MyClinicSoft</h1>
        <p className="text-lg text-gray-700 mb-6 text-center">
          The all-in-one, modern clinic management platform for patient care, operations, and growth.
        </p>
        <ul className="text-left text-gray-800 mb-8 space-y-2">
          <li>✅ Streamline appointments, billing, and inventory</li>
          <li>✅ Secure, PH DPA-compliant patient records</li>
          <li>✅ Automated reminders via SMS & email</li>
          <li>✅ Real-time analytics and reporting</li>
          <li>✅ Cloud-based, accessible anywhere</li>
        </ul>
        <a
          href="/signup"
          className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-8 rounded-lg text-lg shadow transition"
        >
          Get Started Free
        </a>
        <p className="mt-6 text-sm text-gray-500 text-center">
          No credit card required. Try all features for 30 days.
        </p>
      </section>
      <footer className="mt-8 text-gray-400 text-xs text-center">
        &copy; {new Date().getFullYear()} MyClinicSoft. All rights reserved.
      </footer>
    </main>
  );
}
