'use client';

import { useEffect, useState } from 'react';

interface Notification {
  _id: string;
  title: string;
  message: string;
  type: string;
  read: boolean;
  createdAt: string;
  link?: string;
}

export default function NotificationsPageClient() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    fetchNotifications();
  }, []);

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/notifications');
      const data = await response.json();
      
      if (data.success) {
        setNotifications(data.data.notifications || []);
        setUnreadCount(data.data.unreadCount || 0);
      } else {
        setError(data.error || 'Failed to fetch notifications');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch notifications');
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (notificationId: string) => {
    try {
      const response = await fetch(`/api/notifications/${notificationId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ read: true }),
      });

      if (response.ok) {
        setNotifications(prev =>
          prev.map(n => n._id === notificationId ? { ...n, read: true } : n)
        );
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
    } catch (err) {
      console.error('Error marking notification as read:', err);
    }
  };

  const markAllAsRead = async () => {
    try {
      const response = await fetch('/api/notifications/mark-all-read', {
        method: 'POST',
      });

      if (response.ok) {
        setNotifications(prev => prev.map(n => ({ ...n, read: true })));
        setUnreadCount(0);
      }
    } catch (err) {
      console.error('Error marking all as read:', err);
    }
  };

  if (loading) {
    return (
      <section className="py-8 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-gray-50 to-pink-50/30 min-h-screen">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col items-center gap-4 min-h-[50vh] justify-center">
            <div className="relative">
              <div className="animate-spin rounded-full h-16 w-16 border-4 border-pink-100 border-t-pink-600"></div>
            </div>
            <p className="text-gray-600 font-medium">Loading notifications...</p>
          </div>
        </div>
      </section>
    );
  }

  const unreadNotifications = notifications.filter(n => !n.read);
  const readNotifications = notifications.filter(n => n.read);

  return (
    <section className="py-6 sm:py-8 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-gray-50 to-pink-50/30 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col gap-6">
          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-red-500 rounded-lg flex-shrink-0">
                  <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                </div>
                <p className="text-red-800 text-sm font-semibold">{error}</p>
              </div>
            </div>
          )}

          {/* Header */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 sm:p-8">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gradient-to-br from-pink-500 to-pink-600 rounded-lg shadow-md">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                </div>
                <div>
                  <h1 className="text-3xl sm:text-4xl font-bold text-gray-900">Notifications</h1>
                  <p className="text-sm sm:text-base text-gray-600 mt-1">View and manage your notifications</p>
                </div>
              </div>
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="px-5 py-2.5 bg-gradient-to-r from-pink-500 to-pink-600 text-white rounded-lg hover:from-pink-600 hover:to-pink-700 transition-all flex items-center gap-2 text-sm font-semibold shadow-md"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Mark All as Read
                </button>
              )}
            </div>
          </div>

          {notifications.length === 0 && (
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
              <div className="p-12 text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 rounded-full mb-4">
                  <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                </div>
                <h2 className="text-xl font-bold text-gray-900 mb-2">No notifications</h2>
                <p className="text-sm text-gray-600 font-medium">You're all caught up!</p>
              </div>
            </div>
          )}

          {unreadNotifications.length > 0 && (
            <div className="mb-6">
              <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                <div className="p-5 border-b border-gray-200 bg-gray-50/50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-pink-500 rounded-lg">
                        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                        </svg>
                      </div>
                      <h2 className="text-lg font-bold text-gray-900">Unread ({unreadNotifications.length})</h2>
                    </div>
                  </div>
                </div>
                <div className="p-5">
                  <div className="flex flex-col gap-3">
                    {unreadNotifications.map((notification) => (
                      <div
                        key={notification._id}
                        className="bg-gradient-to-r from-pink-50 to-pink-100/30 border-2 border-pink-200 rounded-xl p-5 hover:shadow-md transition-all"
                      >
                        <div className="flex justify-between items-start gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <h3 className="text-lg font-bold text-gray-900">{notification.title}</h3>
                              <span className="px-2.5 py-1 bg-pink-500 text-white text-xs font-semibold rounded-full border border-pink-600">
                                New
                              </span>
                            </div>
                            <p className="text-sm font-medium text-gray-700 mb-2">{notification.message}</p>
                            <p className="text-xs font-semibold text-gray-500">
                              {new Date(notification.createdAt).toLocaleString()}
                            </p>
                          </div>
                          <button
                            onClick={() => markAsRead(notification._id)}
                            className="px-4 py-2 bg-white text-pink-600 rounded-lg hover:bg-pink-50 transition-colors text-sm font-semibold flex items-center gap-2 border border-pink-200 shadow-sm"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            Mark Read
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {readNotifications.length > 0 && (
            <div>
              <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                <div className="p-5 border-b border-gray-200 bg-gray-50/50">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-gray-500 rounded-lg">
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <h2 className="text-lg font-bold text-gray-900">Read ({readNotifications.length})</h2>
                  </div>
                </div>
                <div className="p-5">
                  <div className="flex flex-col gap-3">
                    {readNotifications.map((notification) => (
                      <div
                        key={notification._id}
                        className="bg-white border border-gray-200 rounded-xl p-5 opacity-75 hover:opacity-100 hover:shadow-sm transition-all"
                      >
                        <div className="flex flex-col gap-2">
                          <h3 className="text-lg font-bold text-gray-700">{notification.title}</h3>
                          <p className="text-sm font-medium text-gray-600">{notification.message}</p>
                          <p className="text-xs font-semibold text-gray-500">
                            {new Date(notification.createdAt).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

