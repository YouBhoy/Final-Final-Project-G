import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { appointmentService, userService, workHoursService } from '@spartan-g/shared-services';
import {
  BOOKING_WINDOW_MESSAGE,
  getBookingWindow,
  manilaDateTimeToMs,
  manilaMinutesOfDay,
} from '@spartan-g/shared-types';
import { useAuth } from '../../hooks/useAuth';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const APPOINTMENT_MINUTES = 60;

type WorkSchedule = { dayOfWeek: number; startTime: string; endTime: string };

const pad = (value: number) => String(value).padStart(2, '0');
const toMinutes = (time: string) => {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
};
const toTime = (minutes: number) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
/** Calendar day 'YYYY-MM-DD' -> a Date at local midnight (only used as a day label). */
const dateFromKey = (key: string) => {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
};
const keyFromDate = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
/** Earliest time (HH:mm) bookable today: the next 30-minute mark after now. */
const nextSlotMinutes = (nowMs: number) => Math.ceil((manilaMinutesOfDay(nowMs) + 1) / 30) * 30;

export function StudentBookAppointmentPage() {
  const { facilitatorId } = useParams<{ facilitatorId: string }>();
  const navigate = useNavigate();
  const [facilitator, setFacilitator] = useState<{ displayName: string; email: string } | null>(null);
  // "Now" in real time; the booking window (today..Saturday, Asia/Manila) derives from it.
  const [nowMs, setNowMs] = useState(() => Date.now());
  const bookingWindow = useMemo(() => getBookingWindow(nowMs), [nowMs]);
  const [selectedDate, setSelectedDate] = useState<Date>(() => dateFromKey(getBookingWindow(Date.now()).startDateKey));
  const [currentMonth, setCurrentMonth] = useState(() => dateFromKey(getBookingWindow(Date.now()).startDateKey).getMonth());
  const [currentYear, setCurrentYear] = useState(() => dateFromKey(getBookingWindow(Date.now()).startDateKey).getFullYear());
  const [schedules, setSchedules] = useState<WorkSchedule[]>([]);
  const [selectedTime, setSelectedTime] = useState('09:00');
  const [notes, setNotes] = useState('');
  const [isBooking, setIsBooking] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [bookingMessage, setBookingMessage] = useState('');
  const [error, setError] = useState('');
  const { user } = useAuth();

  // Keep "now" fresh so the window rolls over at midnight (Asia/Manila) and past times stay disabled.
  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!user) return;
    setIsLoading(false);
    if (facilitatorId) {
      userService.getUser(facilitatorId).then(u => {
        if (u) setFacilitator({ displayName: u.displayName || 'Facilitator', email: u.email || '' });
      }).catch(() => {});
    }
  }, [facilitatorId, user]);

  useEffect(() => {
    if (!user || !facilitatorId) return;
    workHoursService.getActiveSchedule(facilitatorId, user.role)
      .then((rows: any[]) => setSchedules(rows as WorkSchedule[]))
      .catch((err) => {
        console.error('Failed to load work hours:', err);
        setSchedules([]);
      });
  }, [facilitatorId, user]);

  const todayKey = bookingWindow.startDateKey;
  const selectedKey = keyFromDate(selectedDate);
  const isToday = selectedKey === todayKey;
  const workHoursForDay = schedules.find(s => s.dayOfWeek === selectedDate.getDay()) ?? null;

  /** Earliest and latest start time (minutes) the student may pick on a given day. */
  const startRange = (schedule: WorkSchedule, key: string) => {
    const earliest = key === todayKey
      ? Math.max(toMinutes(schedule.startTime), nextSlotMinutes(nowMs))
      : toMinutes(schedule.startTime);
    return { earliest, latest: toMinutes(schedule.endTime) - APPOINTMENT_MINUTES };
  };

  // Days left in this week on which the facilitator still has a bookable time.
  const bookableDayCount = bookingWindow.dateKeys.filter(key => {
    const schedule = schedules.find(s => s.dayOfWeek === dateFromKey(key).getDay());
    if (!schedule) return false;
    const { earliest, latest } = startRange(schedule, key);
    return earliest <= latest;
  }).length;
  const schedulesLoaded = schedules.length > 0;

  const dayRange = workHoursForDay ? startRange(workHoursForDay, selectedKey) : null;
  const noTimeLeftToday = isToday && !!workHoursForDay && !!dayRange && dayRange.earliest > dayRange.latest;

  // Default the time to the first bookable time whenever the day (or the schedule) changes.
  useEffect(() => {
    if (!workHoursForDay) return;
    const { earliest, latest } = startRange(workHoursForDay, selectedKey);
    setSelectedTime(toTime(earliest));
  }, [selectedKey, schedules]);

  // Months the window touches (a week can straddle two months).
  const windowMonths = useMemo(() => {
    const seen: { year: number; month: number }[] = [];
    for (const key of bookingWindow.dateKeys) {
      const date = dateFromKey(key);
      const entry = { year: date.getFullYear(), month: date.getMonth() };
      if (!seen.some(m => m.year === entry.year && m.month === entry.month)) seen.push(entry);
    }
    return seen;
  }, [bookingWindow]);
  const monthIndex = windowMonths.findIndex(m => m.year === currentYear && m.month === currentMonth);
  const canGoPrev = monthIndex > 0;
  const canGoNext = monthIndex >= 0 && monthIndex < windowMonths.length - 1;
  const showMonthNav = windowMonths.length > 1;

  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay();

  const goToMonth = (index: number) => {
    const target = windowMonths[index];
    if (!target) return;
    setCurrentMonth(target.month);
    setCurrentYear(target.year);
  };

  const handleDateSelect = (day: number) => {
    setError('');
    setSelectedDate(new Date(currentYear, currentMonth, day));
  };

  const handleBook = async () => {
    if (!user || !facilitatorId || !workHoursForDay) return;
    setError('');
    const freshNow = Date.now();
    setNowMs(freshNow);
    const [hours, minutes] = selectedTime.split(':').map(Number);
    // Appointment times are Asia/Manila wall-clock times, whatever timezone the browser is in.
    const scheduledAtMs = manilaDateTimeToMs(selectedKey, hours, minutes);
    const freshWindow = getBookingWindow(freshNow);
    if (scheduledAtMs < freshWindow.startMs || scheduledAtMs >= freshWindow.endMs) {
      setError(BOOKING_WINDOW_MESSAGE);
      return;
    }
    if (scheduledAtMs <= freshNow) {
      setError('Please choose a time later than the current time.');
      return;
    }
    setIsBooking(true);
    try {
      const appointmentPayload: any = {
        studentId: user.uid,
        facilitatorId,
        scheduledAt: new Date(scheduledAtMs),
        durationMinutes: APPOINTMENT_MINUTES,
      };
      if (notes.trim()) {
        appointmentPayload.notes = notes.trim();
      }
      await appointmentService.requestAppointment(appointmentPayload, user.role);

      setBookingMessage('Appointment requested successfully! The facilitator will be notified.');
      setTimeout(() => navigate('/student/appointments'), 2000);
    } catch (error) {
      console.error('Failed to book appointment:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setError(errorMessage);
    } finally {
      setIsBooking(false);
    }
  };

  if (!facilitatorId) return <div className="text-center py-12 text-gray-500">Invalid facilitator.</div>;
  if (isLoading) return <div className="text-center py-12 text-gray-500">Loading...</div>;
  if (bookingMessage) {
    return (
      <div className="max-w-lg mx-auto bg-white rounded-lg shadow-sm border p-8 text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Appointment Requested</h3>
        <p className="text-sm text-gray-500">{bookingMessage}</p>
      </div>
    );
  }

  const windowKeys = new Set(bookingWindow.dateKeys);
  const timeMin = dayRange ? toTime(dayRange.earliest) : undefined;
  const timeMax = workHoursForDay ? workHoursForDay.endTime : undefined;
  const selectedMinutes = toMinutes(selectedTime || '00:00');
  const timeTooEarly = !!dayRange && isToday && selectedMinutes < dayRange.earliest;

  return (
    <div className="max-w-lg mx-auto">
      <div className="bg-white rounded-lg shadow-sm border p-6">
        {/* Facilitator info */}
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-gray-900">
            Book with {facilitator?.displayName || 'Facilitator'}
          </h2>
          <p className="text-sm text-gray-500">{facilitator?.email}</p>
          <p className="text-xs text-gray-400 mt-1">
            Select a date and time below. Each appointment is 60 minutes. Bookings are limited to the current week
            (today through Saturday).
          </p>
        </div>

        {/* Error message */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}

        {schedulesLoaded && bookableDayCount === 0 && (
          <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800" role="status">
            {BOOKING_WINDOW_MESSAGE} No bookable day is left this week with this facilitator. Please check back next week.
          </div>
        )}

        {/* Calendar */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            {showMonthNav ? (
              <button onClick={() => goToMonth(monthIndex - 1)} disabled={!canGoPrev} aria-label="Previous month"
                className="p-2 hover:bg-gray-100 rounded disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed">&larr;</button>
            ) : <span className="p-2" aria-hidden="true">&nbsp;&nbsp;</span>}
            <h3 className="font-medium">{MONTHS[currentMonth]} {currentYear}</h3>
            {showMonthNav ? (
              <button onClick={() => goToMonth(monthIndex + 1)} disabled={!canGoNext} aria-label="Next month"
                className="p-2 hover:bg-gray-100 rounded disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed">&rarr;</button>
            ) : <span className="p-2" aria-hidden="true">&nbsp;&nbsp;</span>}
          </div>
          <div className="grid grid-cols-7 gap-1 text-center">
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <div key={`${d}-${i}`} className="text-xs font-medium text-gray-500 py-1">{d}</div>)}
            {Array.from({ length: firstDayOfMonth }).map((_, i) => <div key={`empty-${i}`} />)}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const date = new Date(currentYear, currentMonth, day);
              const inWindow = windowKeys.has(keyFromDate(date));
              const isSelected = date.toDateString() === selectedDate.toDateString();
              return (
                <button
                  key={day}
                  disabled={!inWindow}
                  onClick={() => handleDateSelect(day)}
                  aria-label={inWindow ? undefined : `${MONTHS[currentMonth]} ${day} is not available for booking`}
                  className={`py-2 text-sm rounded ${
                    isSelected && inWindow ? 'bg-blue-600 text-white' :
                    !inWindow ? 'text-gray-300 cursor-not-allowed' :
                    'hover:bg-blue-50 text-gray-700'
                  }`}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>

        {/* Time picker: the student chooses a time within the facilitator's work hours */}
        <div className="mb-6">
          <h4 className="text-sm font-medium text-gray-700 mb-3">Choose Your Time</h4>
          {!workHoursForDay ? (
            <p className="text-sm text-gray-400 italic">
              The facilitator is not available on this day. Please select another date.
            </p>
          ) : noTimeLeftToday ? (
            <p className="text-sm text-amber-700">
              No bookable time is left today. Pick another day this week.
            </p>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-gray-500">
                Available hours: <span className="font-medium">{workHoursForDay.startTime} - {workHoursForDay.endTime}</span>
                {isToday && timeMin && timeMin !== workHoursForDay.startTime && (
                  <> · earliest today: <span className="font-medium">{timeMin}</span></>
                )}
              </p>
              <div className="flex items-center gap-3">
                <input
                  type="time"
                  value={selectedTime}
                  onChange={e => setSelectedTime(e.target.value)}
                  min={timeMin}
                  max={timeMax}
                  className="w-full border rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <span className="text-sm text-gray-500 whitespace-nowrap">60 min appointment</span>
              </div>
              {timeTooEarly && (
                <p className="text-xs text-red-600">Please choose a time later than the current time.</p>
              )}
              <p className="text-xs text-amber-600 flex items-center gap-1">
                <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
                Make sure your chosen time allows for the full 60-minute appointment within the facilitator's available hours. If someone else books at the same time, you'll be notified.
              </p>
            </div>
          )}
        </div>

        {/* Notes */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Brief reason for the appointment..."
            className="w-full border rounded-lg p-3 text-sm h-20"
          />
        </div>

        {/* Book button */}
        <button
          onClick={handleBook}
          disabled={!workHoursForDay || isBooking || noTimeLeftToday || timeTooEarly || !windowKeys.has(selectedKey)}
          className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 font-medium"
        >
          {isBooking ? 'Booking...' : 'Request Appointment'}
        </button>
      </div>
    </div>
  );
}
