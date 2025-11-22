import { getUser } from '@/app/lib/dal';
import Sidebar from './Sidebar';

// Navigation items - organized by category
const navItems = [
  // Main Dashboard
  { 
    href: '/', 
    label: 'Dashboard', 
    icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
    category: 'Main'
  },
  // Patient Management
  { 
    href: '/patients', 
    label: 'Patients', 
    icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z',
    category: 'Patient Management'
  },
  // Scheduling
  { 
    href: '/appointments', 
    label: 'Appointments', 
    icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
    category: 'Scheduling'
  },
  { 
    href: '/queue', 
    label: 'Queue', 
    icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4',
    category: 'Scheduling'
  },
  // Clinical
  { 
    href: '/visits', 
    label: 'Clinical Notes', 
    icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
    category: 'Clinical'
  },
  { 
    href: '/prescriptions', 
    label: 'Prescriptions', 
    icon: 'M19.428 15.428a2 2 0 00-1.022-.547l-2.387-2.387a1 1 0 00-1.414 0l-3.293 3.293a1 1 0 01-1.414 0l-3.293-3.293a1 1 0 00-1.414 0L4.547 15.428a2 2 0 00-.547 1.022v4.55a2 2 0 002 2h12a2 2 0 002-2v-4.55a2 2 0 00-.547-1.022zM9 7h6m-6 4h6m-2 4h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
    category: 'Clinical'
  },
  { 
    href: '/lab-results', 
    label: 'Lab Results', 
    icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01',
    category: 'Clinical'
  },
  // Billing & Operations
  { 
    href: '/invoices', 
    label: 'Billing', 
    icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
    category: 'Billing & Operations'
  },
  { 
    href: '/documents', 
    label: 'Documents', 
    icon: 'M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z',
    category: 'Billing & Operations'
  },
  { 
    href: '/referrals', 
    label: 'Referrals', 
    icon: 'M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4',
    category: 'Billing & Operations'
  },
  { 
    href: '/inventory', 
    label: 'Inventory', 
    icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4',
    category: 'Billing & Operations'
  },
  // Staff Management
  { 
    href: '/doctors', 
    label: 'Doctors', 
    icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4',
    category: 'Staff Management'
  },
  // Reports
  { 
    href: '/reports', 
    label: 'Reports', 
    icon: 'M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
    category: 'Reports'
  },
  // Settings
  { 
    href: '/settings', 
    label: 'Settings', 
    icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z',
    category: 'System'
  },
];

export default async function Navigation() {
  let user: { _id: string; name: string; role: string; [key: string]: any } | null = null;
  try {
    user = await getUser() as { _id: string; name: string; role: string; [key: string]: any } | null;
  } catch (error) {
    console.error('Error getting user in Navigation:', error);
    // Continue without user - will show login button
  }

  return <Sidebar navItems={navItems} user={user} />;
}
