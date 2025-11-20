import { redirect } from 'next/navigation';
import { verifySession } from '@/app/lib/dal';
import DashboardClient from '@/components/DashboardClient';

export default async function Dashboard() {
  const session = await verifySession();
  
  if (!session) {
    redirect('/login');
  }

  return <DashboardClient />;
  const [stats, setStats] = useState<Stats>({
    patients: 0,
    appointments: 0,
    doctors: 0,
    todayAppointments: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        const [patientsRes, appointmentsRes, doctorsRes] = await Promise.all([
          fetch('/api/patients'),
          fetch('/api/appointments'),
          fetch('/api/doctors'),
        ]);

        // Try to parse JSON responses (API routes return JSON even on errors)
        let patients, appointments, doctors;
        
        // Helper function to safely parse JSON or handle HTML errors
        const parseResponse = async (res: Response, name: string) => {
          try {
            const contentType = res.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
              return await res.json();
            } else {
              // If not JSON, read as text to see the error
              const text = await res.text();
              console.error(`${name} API returned non-JSON response:`, text.substring(0, 500));
              return { success: false, error: `${name} API error: ${res.status} ${res.statusText}. Check server logs for details.` };
            }
          } catch (parseError: any) {
            console.error(`Error parsing ${name} response:`, parseError);
            return { success: false, error: `${name} API error: Failed to parse response` };
          }
        };
        
        patients = await parseResponse(patientsRes, 'Patients');
        appointments = await parseResponse(appointmentsRes, 'Appointments');
        doctors = await parseResponse(doctorsRes, 'Doctors');

        // Check if any API call failed
        if (!patients.success || !appointments.success || !doctors.success) {
          const errors = [];
          if (!patients.success) errors.push(`Patients: ${patients.error || 'Unknown error'}`);
          if (!appointments.success) errors.push(`Appointments: ${appointments.error || 'Unknown error'}`);
          if (!doctors.success) errors.push(`Doctors: ${doctors.error || 'Unknown error'}`);
          throw new Error(`API errors: ${errors.join(', ')}`);
        }

        const today = new Date().toISOString().split('T')[0];
        const todayAppointments = appointments.data?.filter((apt: any) => {
          const aptDate = new Date(apt.appointmentDate).toISOString().split('T')[0];
          return aptDate === today && apt.status === 'scheduled';
        }).length || 0;

        setStats({
          patients: patients.data?.length || 0,
          appointments: appointments.data?.length || 0,
          doctors: doctors.data?.length || 0,
          todayAppointments,
        });
      } catch (error) {
        console.error('Failed to fetch stats:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchStats();
  }, []);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center">Loading...</div>
      </div>
    );
  }

  const statCards = [
    {
      title: 'Total Patients',
      value: stats.patients,
      href: '/patients',
      color: 'bg-blue-500',
    },
    {
      title: 'Total Appointments',
      value: stats.appointments,
      href: '/appointments',
      color: 'bg-green-500',
    },
    {
      title: 'Today\'s Appointments',
      value: stats.todayAppointments,
      href: '/appointments',
      color: 'bg-yellow-500',
    },
    {
      title: 'Doctors',
      value: stats.doctors,
      href: '/doctors',
      color: 'bg-purple-500',
    },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-2 text-gray-600">Welcome to Clinic Management System</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {statCards.map((card) => (
          <Link
            key={card.title}
            href={card.href}
            className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow"
          >
            <div className="flex items-center">
              <div className={`${card.color} rounded-lg p-3 mr-4`}>
                <svg
                  className="w-6 h-6 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                  />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600">{card.title}</p>
                <p className="text-2xl font-bold text-gray-900">{card.value}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link
            href="/patients/new"
            className="flex items-center p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <div className="flex-shrink-0">
              <svg
                className="w-6 h-6 text-blue-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
            </div>
            <span className="ml-3 font-medium">Add New Patient</span>
          </Link>
          <Link
            href="/appointments/new"
            className="flex items-center p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <div className="flex-shrink-0">
              <svg
                className="w-6 h-6 text-green-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
            </div>
            <span className="ml-3 font-medium">Schedule Appointment</span>
          </Link>
          <Link
            href="/doctors/new"
            className="flex items-center p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <div className="flex-shrink-0">
              <svg
                className="w-6 h-6 text-purple-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
                />
              </svg>
            </div>
            <span className="ml-3 font-medium">Add Doctor</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
