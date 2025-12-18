import Link from 'next/link';
import Image from 'next/image';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Features - MyClinicSoft',
  description: 'Discover all the powerful features of MyClinicSoft - comprehensive clinic management solution',
};

export default function FeaturesPage() {
  const coreFeatures = [
    {
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ),
      title: 'Patient Management',
      description: 'Complete patient records with medical history, demographics, and file management. Track allergies, medications, and comprehensive medical information in one centralized, secure location.',
      color: 'blue',
      image: 'https://images.unsplash.com/photo-1551601651-2a8555f1a136?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&h=600&q=80',
      subItems: [
        'Patient registration and profile management',
        'Medical history tracking',
        'Allergies and medication history',
        'Demographics and contact information',
        'File attachments and document storage',
        'Patient alerts and reminders',
        'QR code login for patients',
      ],
    },
    {
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      ),
      title: 'Doctor & Staff Management',
      description: 'Manage doctor profiles, specializations, schedules, and staff members. Track productivity, set availability, and assign roles with comprehensive staff management tools.',
      color: 'indigo',
      image: 'https://images.unsplash.com/photo-1559839734-2b71ea197ec2?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&h=600&q=80',
      subItems: [
        'Doctor profile management',
        'Specialization management',
        'Schedule and availability settings',
        'Productivity tracking',
        'Staff role assignment',
        'Performance reports',
        'Medical representatives management',
      ],
    },
    {
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
      title: 'Appointment Scheduling',
      description: 'Schedule and manage appointments with automated reminders via SMS and email. Public booking system allows patients to book online, reducing no-shows and optimizing workflow.',
      color: 'purple',
      image: 'https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&h=600&q=80',
      subItems: [
        'Calendar view and scheduling',
        'Automated SMS and email reminders',
        'Public online booking system',
        'Appointment confirmation',
        'No-show handling',
        'Waitlist management',
        'Recurring appointments',
      ],
    },
    {
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
      title: 'Dashboard',
      description: 'Real-time overview of clinic statistics, appointments, and quick actions. Get instant insights into your clinic\'s performance with customizable dashboards for different roles.',
      color: 'green',
      image: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&h=600&q=80',
      subItems: [
        'Real-time statistics',
        'Appointment overview',
        'Quick actions',
        'Role-based dashboards',
        'Performance metrics',
        'Revenue tracking',
        'Patient statistics',
      ],
    },
  ];

  const clinicalFeatures = [
    {
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
      title: 'Visit Management',
      description: 'Clinical notes with SOAP format, ICD-10 diagnoses, and complete visit history. Record vital signs, physical examinations, and treatment plans with full documentation.',
      color: 'blue',
      image: 'https://images.unsplash.com/photo-1450101499163-c8848c66ca85?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&h=600&q=80',
      subItems: [
        'SOAP notes (Subjective, Objective, Assessment, Plan)',
        'ICD-10 diagnosis coding',
        'Vital signs recording',
        'Physical examination notes',
        'Treatment plans',
        'Medical certificate generation',
        'Lab request forms',
      ],
    },
    {
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
        </svg>
      ),
      title: 'Prescription Management',
      description: 'E-prescriptions with automated drug interaction checking and printing. Generate professional prescriptions with dosage calculations and medication history tracking.',
      color: 'indigo',
      image: 'https://images.unsplash.com/photo-1587854692152-cbe660dbde88?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&h=600&q=80',
      subItems: [
        'E-prescription generation',
        'Drug interaction checking',
        'Dosage calculations',
        'Prescription printing',
        'Medication history tracking',
        'Dispense tracking',
        'Pharmacy integration',
      ],
    },
    {
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
        </svg>
      ),
      title: 'Laboratory Results',
      description: 'Lab test management with third-party integration and automated patient notifications. Store, track, and share lab results securely with patients and other healthcare providers.',
      color: 'purple',
      image: 'https://images.unsplash.com/photo-1582719471384-894fbb16e074?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&h=600&q=80',
      subItems: [
        'Lab test management',
        'Third-party lab integration',
        'Automated patient notifications',
        'Result storage and tracking',
        'Lab request forms',
        'Result sharing',
        'Historical lab data',
      ],
    },
    {
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
        </svg>
      ),
      title: 'Referrals',
      description: 'Patient referral tracking and management. Seamlessly refer patients to specialists and track referral status with complete documentation and communication history.',
      color: 'green',
      image: 'https://images.unsplash.com/photo-1576091160550-2173dba999ef?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&h=600&q=80',
      subItems: [
        'Referral creation and tracking',
        'Specialist management',
        'Referral status updates',
        'Documentation and notes',
        'Communication history',
        'Follow-up tracking',
        'Referral reports',
      ],
    },
    {
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
        </svg>
      ),
      title: 'Queue Management',
      description: 'Patient queue system with QR codes and display screens. Efficiently manage patient flow with digital queue management, check-in systems, and real-time status updates.',
      color: 'orange',
      image: 'https://images.unsplash.com/photo-1559757148-5c350d0d3c56?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&h=600&q=80',
      subItems: [
        'Digital queue system',
        'QR code generation',
        'Display screen integration',
        'Check-in systems',
        'Real-time status updates',
        'Queue analytics',
        'Priority queue management',
      ],
    },
  ];

  const administrativeFeatures = [
    {
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      title: 'Billing & Invoices',
      description: 'Complete billing system with automated invoice generation, payment tracking, and receipt printing. Track outstanding balances and send automated payment reminders.',
      color: 'green',
      image: 'https://images.unsplash.com/photo-1554224155-6726b3ff858f?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&h=600&q=80',
      subItems: [
        'Automated invoice generation',
        'Payment tracking',
        'Receipt printing',
        'Outstanding balance tracking',
        'Automated payment reminders',
        'Multiple payment methods',
        'Financial reports',
      ],
    },
    {
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
      ),
      title: 'Inventory Management',
      description: 'Medicine and supply inventory tracking with low stock alerts and automated reordering. Manage stock levels, track expiration dates, and generate inventory reports.',
      color: 'blue',
      image: 'https://images.unsplash.com/photo-1587854692152-cbe660dbde88?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&h=600&q=80',
      subItems: [
        'Medicine and supply tracking',
        'Low stock alerts',
        'Automated reordering',
        'Stock level management',
        'Expiration date tracking',
        'Inventory adjustments',
        'Inventory reports',
      ],
    },
    {
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
      title: 'Document Management',
      description: 'Secure document storage with Cloudinary integration. Upload, organize, and retrieve medical documents, images, and files with advanced search and categorization.',
      color: 'indigo',
      image: 'https://images.unsplash.com/photo-1450101499163-c8848c66ca85?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&h=600&q=80',
      subItems: [
        'Secure document storage',
        'Cloudinary integration',
        'Document upload and organization',
        'Advanced search functionality',
        'Document categorization',
        'File sharing',
        'Document versioning',
      ],
    },
    {
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
      title: 'Reports & Analytics',
      description: 'Comprehensive reporting for consultations, income, demographics, and more. Generate custom reports with visualizations and export data for further analysis.',
      color: 'purple',
      image: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&h=600&q=80',
      subItems: [
        'Consultation reports',
        'Income and financial reports',
        'Demographics reports',
        'Custom report generation',
        'Data visualizations',
        'Export functionality',
        'HMO claims reports',
      ],
    },
    {
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      ),
      title: 'Audit Logging',
      description: 'Complete audit trail for compliance and security. Track all system activities, user actions, and data access with detailed logs for regulatory compliance.',
      color: 'red',
      image: 'https://images.unsplash.com/photo-1563013544-824ae1b704d3?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&h=600&q=80',
      subItems: [
        'Complete audit trail',
        'User action tracking',
        'Data access logging',
        'System activity logs',
        'Regulatory compliance',
        'Security monitoring',
        'Audit report generation',
      ],
    },
    {
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
        </svg>
      ),
      title: 'Membership & Loyalty',
      description: 'Patient membership programs with points and referral tracking. Build patient loyalty with reward systems, membership tiers, and referral incentives.',
      color: 'yellow',
      image: 'https://images.unsplash.com/photo-1552664730-d307ca884978?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&h=600&q=80',
      subItems: [
        'Membership programs',
        'Points and rewards system',
        'Referral tracking',
        'Membership tiers',
        'Loyalty incentives',
        'Patient retention tools',
        'Membership analytics',
      ],
    },
  ];

  const additionalFeatures = [
    {
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
      ),
      title: 'Notifications',
      description: 'In-app notification system for appointments, lab results, and important updates. Stay informed with real-time alerts and customizable notification preferences.',
      color: 'blue',
      image: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&h=600&q=80',
      subItems: [
        'In-app notifications',
        'Appointment reminders',
        'Lab result notifications',
        'Real-time alerts',
        'Customizable preferences',
        'Notification history',
        'Unread notification tracking',
      ],
    },
    {
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      ),
      title: 'Room Management',
      description: 'Clinic room assignment and scheduling. Efficiently manage room availability, assign appointments to rooms, and track room utilization.',
      color: 'indigo',
      image: 'https://images.unsplash.com/photo-1551601651-2a8555f1a136?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&h=600&q=80',
      subItems: [
        'Room assignment',
        'Room scheduling',
        'Availability management',
        'Room utilization tracking',
        'Room capacity management',
        'Room-based reports',
        'Multi-room support',
      ],
    },
    {
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      ),
      title: 'Service Management',
      description: 'Clinic services and pricing management. Define services, set pricing, and track service utilization with comprehensive service catalog management.',
      color: 'purple',
      image: 'https://images.unsplash.com/photo-1552664730-d307ca884978?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&h=600&q=80',
      subItems: [
        'Service catalog management',
        'Pricing management',
        'Service utilization tracking',
        'Service categories',
        'Service descriptions',
        'Service-based billing',
        'Service reports',
      ],
    },
    {
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      ),
      title: 'Patient Portal',
      description: 'Public booking and patient access portal. Patients can book appointments, view medical records, access lab results, and manage their health information online.',
      color: 'green',
      image: 'https://images.unsplash.com/photo-1573164713714-d95e436ab8d6?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&h=600&q=80',
      subItems: [
        'Public appointment booking',
        'Medical records access',
        'Lab results viewing',
        'Health information management',
        'Patient login system',
        'QR code login',
        'Secure patient portal',
      ],
    },
    {
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      ),
      title: 'SMS Integration',
      description: 'Twilio integration for appointment reminders and notifications. Send automated SMS reminders, confirmations, and important updates directly to patients.',
      color: 'cyan',
      image: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&h=600&q=80',
      subItems: [
        'Twilio integration',
        'Automated SMS reminders',
        'Appointment confirmations',
        'SMS notifications',
        'Bulk SMS sending',
        'SMS templates',
        'Delivery tracking',
      ],
    },
    {
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      ),
      title: 'Email Integration',
      description: 'Email notifications and communications. Send automated emails for appointments, lab results, invoices, and important clinic communications.',
      color: 'blue',
      image: 'https://images.unsplash.com/photo-1563013544-824ae1b704d3?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&h=600&q=80',
      subItems: [
        'SMTP email integration',
        'Automated email notifications',
        'Appointment emails',
        'Lab result emails',
        'Invoice emails',
        'Email templates',
        'Email delivery tracking',
      ],
    },
    {
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
      ),
      title: 'Security & Compliance',
      description: 'PH DPA compliance, data encryption, and access controls. Enterprise-grade security with role-based access, audit trails, and HIPAA-compliant infrastructure.',
      color: 'red',
      image: 'https://images.unsplash.com/photo-1563013544-824ae1b704d3?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&h=600&q=80',
      subItems: [
        'PH DPA compliance',
        'Data encryption',
        'Role-based access control',
        'HIPAA-compliant infrastructure',
        'Secure authentication',
        'Data backup and recovery',
        'Security audits',
      ],
    },
  ];

  const colorClasses = {
    blue: 'from-blue-500 to-blue-600 bg-blue-50 text-blue-600 border-blue-200',
    indigo: 'from-indigo-500 to-indigo-600 bg-indigo-50 text-indigo-600 border-indigo-200',
    purple: 'from-purple-500 to-purple-600 bg-purple-50 text-purple-600 border-purple-200',
    green: 'from-green-500 to-green-600 bg-green-50 text-green-600 border-green-200',
    orange: 'from-orange-500 to-orange-600 bg-orange-50 text-orange-600 border-orange-200',
    red: 'from-red-500 to-red-600 bg-red-50 text-red-600 border-red-200',
    yellow: 'from-yellow-500 to-yellow-600 bg-yellow-50 text-yellow-600 border-yellow-200',
    cyan: 'from-cyan-500 to-cyan-600 bg-cyan-50 text-cyan-600 border-cyan-200',
  };

  const FeatureCard = ({ feature }: { feature: typeof coreFeatures[0] & { subItems?: string[]; image?: string } }) => {
    const colors = colorClasses[feature.color as keyof typeof colorClasses];
    const colorParts = colors.split(' ');
    const textColor = colorParts[3]; // Extract text color (e.g., 'text-blue-600')

    return (
      <div className="group relative bg-white/80 backdrop-blur-sm rounded-2xl overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-300 border border-gray-100/50 hover:border-blue-300 hover:-translate-y-1">
        {/* Image Section */}
        {feature.image && (
          <div className="relative h-48 sm:h-56 overflow-hidden">
            <Image
              src={feature.image}
              alt={feature.title}
              fill
              className="object-cover group-hover:scale-110 transition-transform duration-700"
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-gray-900/70 via-gray-900/30 to-transparent"></div>
            <div className="absolute bottom-4 left-4 right-4">
              <div className="w-12 h-12 bg-white/95 backdrop-blur-sm rounded-xl flex items-center justify-center shadow-lg">
                <div className={textColor}>
                  {feature.icon}
                </div>
              </div>
            </div>
          </div>
        )}
        
        {/* Content Section */}
        <div className="p-6 sm:p-8">
          {!feature.image && (
            <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${colorParts.slice(0, 2).join(' ')} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform shadow-lg`}>
              <div className="text-white">
                {feature.icon}
              </div>
            </div>
          )}
          <h3 className="text-xl sm:text-2xl font-bold text-gray-900 mb-3">{feature.title}</h3>
          <p className="text-gray-600 leading-relaxed text-sm sm:text-base mb-4">{feature.description}</p>
          {feature.subItems && feature.subItems.length > 0 && (
            <ul className="space-y-2 mt-4">
              {feature.subItems.map((item, index) => (
                <li key={index} className="flex items-start gap-2 text-sm text-gray-600">
                  <svg className={`w-5 h-5 flex-shrink-0 mt-0.5 ${textColor}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Abstract Background Elements */}
      <div className="fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50"></div>
        <div className="absolute top-0 -left-4 w-96 h-96 bg-blue-400 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob"></div>
        <div className="absolute top-0 -right-4 w-96 h-96 bg-purple-400 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob animation-delay-2000"></div>
        <div className="absolute -bottom-8 left-20 w-96 h-96 bg-indigo-400 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob animation-delay-4000"></div>
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]"></div>
      </div>

      {/* Hero Section */}
      <section className="relative pt-24 sm:pt-32 pb-12 sm:pb-16 px-4 sm:px-6 lg:px-8">
        <div className="container mx-auto max-w-7xl">
          <div className="text-center mb-12">
            <div className="inline-block px-4 py-2 bg-blue-100 rounded-full mb-4">
              <span className="text-sm font-semibold text-blue-700">Features</span>
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-gray-900 mb-6">
              Comprehensive{' '}
              <span className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent">
                Clinic Management
              </span>
            </h1>
            <p className="text-xl sm:text-2xl text-gray-700 max-w-3xl mx-auto leading-relaxed">
              Everything you need to run a modern, efficient healthcare practice
            </p>
          </div>
        </div>
      </section>

      {/* Core Features Section */}
      <section className="relative py-12 sm:py-16 lg:py-20 px-4 sm:px-6 lg:px-8">
        <div className="container mx-auto max-w-7xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-4">
              Core Features
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Essential tools for managing your clinic operations
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8">
            {coreFeatures.map((feature, index) => (
              <FeatureCard key={index} feature={feature} />
            ))}
          </div>
        </div>
      </section>

      {/* Clinical Features Section */}
      <section className="relative py-12 sm:py-16 lg:py-20 px-4 sm:px-6 lg:px-8 bg-white/40 backdrop-blur-sm">
        <div className="container mx-auto max-w-7xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-4">
              Clinical Features
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Advanced tools for patient care and clinical documentation
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
            {clinicalFeatures.map((feature, index) => (
              <FeatureCard key={index} feature={feature} />
            ))}
          </div>
        </div>
      </section>

      {/* Administrative Features Section */}
      <section className="relative py-12 sm:py-16 lg:py-20 px-4 sm:px-6 lg:px-8">
        <div className="container mx-auto max-w-7xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-4">
              Administrative Features
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Powerful tools for managing clinic operations and finances
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
            {administrativeFeatures.map((feature, index) => (
              <FeatureCard key={index} feature={feature} />
            ))}
          </div>
        </div>
      </section>

      {/* Additional Features Section */}
      <section className="relative py-12 sm:py-16 lg:py-20 px-4 sm:px-6 lg:px-8 bg-white/40 backdrop-blur-sm">
        <div className="container mx-auto max-w-7xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-4">
              Additional Features
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Integrations and tools to enhance your clinic operations
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
            {additionalFeatures.map((feature, index) => (
              <FeatureCard key={index} feature={feature} />
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
            Ready to Transform Your Clinic?
          </h2>
          <p className="text-base sm:text-lg lg:text-xl text-blue-100 mb-8 sm:mb-12 max-w-2xl mx-auto leading-relaxed">
            Join thousands of healthcare professionals who trust MyClinicSoft for their clinic management needs.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Link
              href="/onboard"
              className="group px-6 sm:px-8 py-3 sm:py-4 bg-white text-blue-600 rounded-xl sm:rounded-2xl font-semibold hover:bg-blue-50 transition-all shadow-xl hover:shadow-2xl hover:scale-105 flex items-center gap-2 text-sm sm:text-base"
            >
              Get Started
              <svg className="w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
            <Link
              href="/book"
              className="px-6 sm:px-8 py-3 sm:py-4 bg-blue-500/90 backdrop-blur-sm text-white rounded-xl sm:rounded-2xl font-semibold hover:bg-blue-400 transition-all shadow-xl hover:shadow-2xl hover:scale-105 flex items-center gap-2 text-sm sm:text-base"
            >
              Book Appointment
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

