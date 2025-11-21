'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface Queue {
  _id: string;
  queueNumber: string;
  queueType: 'appointment' | 'walk-in' | 'follow-up';
  patient: {
    _id: string;
    firstName: string;
    lastName: string;
  };
  patientName: string;
  status: 'waiting' | 'in-progress' | 'completed' | 'cancelled' | 'no-show';
  queuedAt: string;
  checkedIn: boolean;
}

export default function QueuePageClient() {
  const [queue, setQueue] = useState<Queue[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    fetchQueue();
    const interval = setInterval(fetchQueue, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const fetchQueue = async () => {
    try {
      const res = await fetch('/api/queue');
      
      if (res.status === 401) {
        router.push('/login');
        return;
      }
      
      const contentType = res.headers.get('content-type');
      let data;
      if (contentType && contentType.includes('application/json')) {
        data = await res.json();
      } else {
        const text = await res.text();
        console.error('API returned non-JSON response:', text.substring(0, 500));
        data = { success: false, error: `API error: ${res.status} ${res.statusText}` };
      }
      
      if (data.success) {
        setQueue(data.data);
      } else {
        console.error('Failed to fetch queue:', data.error);
      }
    } catch (error) {
      console.error('Failed to fetch queue:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'in-progress':
        return 'bg-blue-100 text-blue-800';
      case 'waiting':
        return 'bg-yellow-100 text-yellow-800';
      case 'cancelled':
      case 'no-show':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'appointment':
        return 'bg-blue-100 text-blue-800';
      case 'walk-in':
        return 'bg-purple-100 text-purple-800';
      case 'follow-up':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return (
      <div className="w-full px-4 py-3">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-200 border-t-blue-600"></div>
            <p className="mt-3 text-sm text-gray-600">Loading queue...</p>
          </div>
        </div>
      </div>
    );
  }

  const waitingQueue = queue.filter(q => q.status === 'waiting' || q.status === 'in-progress').sort((a, b) => 
    new Date(a.queuedAt).getTime() - new Date(b.queuedAt).getTime()
  );

  return (
    <div className="w-full px-4 py-3">
      <div className="flex justify-between items-center mb-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Queue Management</h1>
          <p className="text-gray-600 text-sm">Monitor patient queue and flow</p>
        </div>
        <div className="text-xs text-gray-500">
          Auto-refreshes every 30s
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-3">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3">
          <div className="text-xs text-gray-500 mb-1">Waiting</div>
          <div className="text-2xl font-bold text-yellow-600">
            {queue.filter(q => q.status === 'waiting').length}
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3">
          <div className="text-xs text-gray-500 mb-1">In Progress</div>
          <div className="text-2xl font-bold text-blue-600">
            {queue.filter(q => q.status === 'in-progress').length}
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3">
          <div className="text-xs text-gray-500 mb-1">Total Today</div>
          <div className="text-2xl font-bold text-gray-900">
            {queue.length}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-4 py-2.5 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">Current Queue</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  Queue #
                </th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  Patient
                </th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  Queued At
                </th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  Checked In
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {waitingQueue.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500 text-sm">
                    No patients in queue
                  </td>
                </tr>
              ) : (
                waitingQueue.map((item) => (
                  <tr key={item._id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-2.5 whitespace-nowrap text-sm font-bold text-gray-900">
                      {item.queueNumber}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <span className={`px-2 py-0.5 inline-flex text-xs leading-4 font-semibold rounded-full ${getTypeColor(item.queueType)}`}>
                        {item.queueType}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap text-sm text-gray-900">
                      {item.patientName || `${item.patient?.firstName} ${item.patient?.lastName}`}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <span className={`px-2 py-0.5 inline-flex text-xs leading-4 font-semibold rounded-full ${getStatusColor(item.status)}`}>
                        {item.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap text-sm text-gray-500">
                      {new Date(item.queuedAt).toLocaleTimeString()}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap text-sm text-gray-500">
                      {item.checkedIn ? (
                        <span className="text-green-600 text-xs">✓ Yes</span>
                      ) : (
                        <span className="text-gray-400 text-xs">No</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

