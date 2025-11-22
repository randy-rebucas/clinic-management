'use client';

import { useState } from 'react';
import { Button, Flex, Box, Text, Card, Badge, Heading } from '@radix-ui/themes';

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
    <Card>
      <Flex direction="column" gap="4" p="4">
        <Flex align="center" justify="between">
          <Heading size="4">
            {monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}
          </Heading>
          <Flex align="center" gap="2">
            <Button
              variant="ghost"
              size="1"
              onClick={() => navigateMonth('prev')}
              aria-label="Previous month"
            >
              <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Button>
            <Button variant="soft" color="blue" size="1" onClick={goToToday}>
              Today
            </Button>
            <Button
              variant="ghost"
              size="1"
              onClick={() => navigateMonth('next')}
              aria-label="Next month"
            >
              <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Button>
          </Flex>
        </Flex>

        <Box style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', marginBottom: '8px' }}>
          {dayNames.map((day) => (
            <Box key={day} style={{ textAlign: 'center' }} py="2">
              <Text size="1" weight="medium" color="gray">
                {day}
              </Text>
            </Box>
          ))}
        </Box>

        <Box style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
          {days.map((date, index) => {
            const dayAppointments = getAppointmentsForDate(date);
            const appointmentCount = dayAppointments.length;
            const hasWalkIn = dayAppointments.some((apt) => apt.isWalkIn);
            const isPastDate = date && date < new Date(new Date().setHours(0, 0, 0, 0));

            return (
              <Button
                key={index}
                variant={isSelected(date) ? 'solid' : 'ghost'}
                color={isSelected(date) ? 'blue' : 'gray'}
                size="1"
                onClick={() => date && onDateSelect(date)}
                disabled={!date}
                style={{
                  aspectRatio: '1',
                  padding: '4px',
                  position: 'relative',
                  opacity: isPastDate ? 0.5 : 1,
                  ...(isToday(date) && !isSelected(date)
                    ? {
                        border: '2px solid var(--blue-9)',
                      }
                    : {}),
                }}
              >
                <Flex direction="column" align="center" justify="center" gap="1" style={{ height: '100%' }}>
                  <Text
                    size="2"
                    weight={isSelected(date) ? 'bold' : 'regular'}
                    color={isSelected(date) ? 'blue' : 'gray'}
                  >
                    {date?.getDate()}
                  </Text>
                  {appointmentCount > 0 && (
                    <Badge
                      size="1"
                      color={hasWalkIn ? 'orange' : 'blue'}
                      variant="soft"
                      style={{ marginTop: '2px' }}
                    >
                      {appointmentCount}
                    </Badge>
                  )}
                </Flex>
              </Button>
            );
          })}
        </Box>
      </Flex>
    </Card>
  );
}

