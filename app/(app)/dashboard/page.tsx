import { redirect } from 'next/navigation';
import { verifySession } from '@/app/lib/dal';
import AdminDashboard from '@/components/dashboards/AdminDashboard';
import DoctorDashboard from '@/components/dashboards/DoctorDashboard';
import NurseDashboard from '@/components/dashboards/NurseDashboard';
import ReceptionistDashboard from '@/components/dashboards/ReceptionistDashboard';
import AccountantDashboard from '@/components/dashboards/AccountantDashboard';

export default async function Dashboard() {
  const session = await verifySession();
  
  if (!session) {
    redirect('/login');
  }

  // Route to role-specific dashboard
  switch (session.role) {
    case 'admin':
      return <AdminDashboard />;
    case 'doctor':
      return <DoctorDashboard />;
    case 'nurse':
      return <NurseDashboard />;
    case 'receptionist':
      return <ReceptionistDashboard />;
    case 'accountant':
      return <AccountantDashboard />;
    default:
      // Fallback to admin dashboard if role is unknown
      return <AdminDashboard />;
  }
}

