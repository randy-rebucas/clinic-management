'use client';

import dynamic from 'next/dynamic';

type Role = 'admin' | 'owner' | 'doctor' | 'nurse' | 'receptionist' | 'accountant' | 'medical-representative' | 'medical-technologist';

const AdminDashboard = dynamic(() => import('./dashboards/AdminDashboard'));
const DoctorDashboard = dynamic(() => import('./dashboards/DoctorDashboard'));
const NurseDashboard = dynamic(() => import('./dashboards/NurseDashboard'));
const ReceptionistDashboard = dynamic(() => import('./dashboards/ReceptionistDashboard'));
const AccountantDashboard = dynamic(() => import('./dashboards/AccountantDashboard'));
const LabDashboard = dynamic(() => import('./dashboards/LabDashboard'));

export default function DashboardRouter({ role }: { role: Role }) {
  switch (role) {
    case 'admin':
    case 'owner':
      return <AdminDashboard />;
    case 'doctor':
      return <DoctorDashboard />;
    case 'nurse':
      return <NurseDashboard />;
    case 'receptionist':
      return <ReceptionistDashboard />;
    case 'accountant':
      return <AccountantDashboard />;
    case 'medical-technologist':
      return <LabDashboard />;
    default:
      return <AdminDashboard />;
  }
}
