'use client';

import { useState } from 'react';

interface Appointment {
  _id: string;
  patient: {
    firstName: string;
    lastName: string;
  };
  doctor?: {
    firstName: string;
    lastName: string;
  };
  appointmentDate: string;
  appointmentTime: string;
  status: string;
  isWalkIn?: boolean;
  queueNumber?: number;
}

interface AppointmentCalendarProps {
  appointments: Appointment[];
  selectedDate: Date;
  onDateSelect: (date: Date) => void;
  onAppointmentClick?: (appointment: Appointment) => void;
}

export default function AppointmentCalendar({
  appointments,
  selectedDate,
  onDateSelect,
}: AppointmentCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(selectedDate);

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    const days = [];
    // Add empty cells for days before the first day of the month
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }
    // Add all days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(new Date(year, month, day));
    }
    return days;
  };

  const getAppointmentsForDate = (date: Date | null) => {
    if (!date) return [];
    const dateStr = date.toISOString().split('T')[0];
    return appointments.filter((apt) => {
      const aptDate = new Date(apt.appointmentDate).toISOString().split('T')[0];
      return aptDate === dateStr;
    });
  };

  const isToday = (date: Date | null) => {
    if (!date) return false;
    const today = new Date();
    return (
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear()
    );
  };

  const isSelected = (date: Date | null) => {
    if (!date) return false;
    return (
      date.getDate() === selectedDate.getDate() &&
      date.getMonth() === selectedDate.getMonth() &&
      date.getFullYear() === selectedDate.getFullYear()
    );
  };

  const navigateMonth = (direction: 'prev' | 'next') => {
    setCurrentMonth((prev) => {
      const newDate = new Date(prev);
      if (direction === 'prev') {
        newDate.setMonth(prev.getMonth() - 1);
      } else {
        newDate.setMonth(prev.getMonth() + 1);
      }
      return newDate;
    });
  };

  const goToToday = () => {
    const today = new Date();
    setCurrentMonth(today);
    onDateSelect(today);
  };

  const monthNames = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const days = getDaysInMonth(currentMonth);

  return (
    <div className="bg-white border border-gray-200 rounded-lg">
      <div className="flex flex-col gap-4 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">
            {monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigateMonth('prev')}
              aria-label="Previous month"
              className="p-1.5 hover:bg-gray-100 rounded text-gray-600 hover:text-gray-900 transition-colors"
            >
              <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              onClick={goToToday}
              className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-md text-xs font-medium transition-colors"
            >
              Today
            </button>
            <button
              onClick={() => navigateMonth('next')}
              aria-label="Next month"
              className="p-1.5 hover:bg-gray-100 rounded text-gray-600 hover:text-gray-900 transition-colors"
            >
              <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1 mb-2">
          {dayNames.map((day) => (
            <div key={day} className="text-center py-2">
              <span className="text-xs font-medium text-gray-500">
                {day}
              </span>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {days.map((date, index) => {
            const dayAppointments = getAppointmentsForDate(date);
            const appointmentCount = dayAppointments.length;
            const hasWalkIn = dayAppointments.some((apt) => apt.isWalkIn);
            const isPastDate = date && date < new Date(new Date().setHours(0, 0, 0, 0));

            return (
              <button
                key={index}
                onClick={() => date && onDateSelect(date)}
                disabled={!date}
                className={`aspect-square p-1 relative transition-colors ${
                  isSelected(date)
                    ? 'bg-blue-600 text-white'
                    : 'bg-transparent hover:bg-gray-100 text-gray-700'
                } ${isPastDate ? 'opacity-50' : ''} ${
                  isToday(date) && !isSelected(date) ? 'border-2 border-blue-600' : ''
                } rounded disabled:opacity-0 disabled:cursor-default`}
              >
                <div className="flex flex-col items-center justify-center gap-1 h-full">
                  <span
                    className={`text-sm ${
                      isSelected(date) ? 'font-bold text-white' : 'font-normal text-gray-700'
                    }`}
                  >
                    {date?.getDate()}
                  </span>
                  {appointmentCount > 0 && (
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded mt-0.5 ${
                        hasWalkIn
                          ? 'bg-orange-100 text-orange-700'
                          : 'bg-blue-100 text-blue-700'
                      }`}
                    >
                      {appointmentCount}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
