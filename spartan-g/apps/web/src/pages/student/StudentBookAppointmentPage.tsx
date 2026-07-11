import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { appointmentService, userService, workHoursService } from '@spartan-g/shared-services';
import { useAuth } from '../../hooks/useAuth';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function StudentBookAppointmentPage() {
  const { facilitatorId } = useParams<{ facilitatorId: string }>();
  const navigate = useNavigate();
  const [facilitator, setFacilitator] = useState<{ displayName: string; email: string } | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [workHoursForDay, setWorkHoursForDay] = useState<{ startTime: string; endTime: string } | null>(null);
  const [selectedTime, setSelectedTime] = useState('09:00');
  const [notes, setNotes] = useState('');
  const [isBooking, setIsBooking] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [bookingMessage, setBookingMessage] = useState('');
  const [error, setError] = useState('');
  const { user } = useAuth();

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
    setError('');
    // Load work hours for the selected date's day of week
    workHoursService.getActiveSchedule(facilitatorId, user.role)
      .then((schedules: any[]) => {
        const daySchedule = schedules.find((s: any) => s.dayOfWeek === selectedDate.getDay());
        if (daySchedule) {
          setWorkHoursForDay({ startTime: daySchedule.startTime, endTime: daySchedule.endTime });
          // Default time to start of work hours
          setSelectedTime(daySchedule.startTime);
        } else {
          setWorkHoursForDay(null);
        }
      })
      .catch((err) => {
        console.error('Failed to load work hours:', err);
        setWorkHoursForDay(null);
      });
  }, [facilitatorId, selectedDate, user]);

  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay();

  const prevMonth = () => {
    if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(currentYear - 1); }
    else setCurrentMonth(currentMonth - 1);
  };
  const nextMonth = () => {
    if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(currentYear + 1); }
    else setCurrentMonth(currentMonth + 1);
  };

  const handleDateSelect = (day: number) => {
    setError('');
    setSelectedDate(new Date(currentYear, currentMonth, day));
  };

  const handleBook = async () => {
    if (!user || !facilitatorId || !workHoursForDay) return;
    setIsBooking(true);
    setError('');
    try {
      const [hours, minutes] = selectedTime.split(':').map(Number);
      const scheduledAt = new Date(selectedDate);
      scheduledAt.setHours(hours, minutes, 0, 0);

      const appointmentPayload: any = {
        studentId: user.uid,
        facilitatorId,
        scheduledAt,
        durationMinutes: 60,
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

  const today = new Date();
  today.setHours(0, 0, 0, 0);

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
            Select a date and available time slot below. Each appointment is 60 minutes.
          </p>
        </div>

        {/* Error message */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Calendar */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <button onClick={prevMonth} className="p-2 hover:bg-gray-100 rounded">&larr;</button>
            <h3 className="font-medium">{MONTHS[currentMonth]} {currentYear}</h3>
            <button onClick={nextMonth} className="p-2 hover:bg-gray-100 rounded">&rarr;</button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center">
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <div key={`${d}-${i}`} className="text-xs font-medium text-gray-500 py-1">{d}</div>)}
            {Array.from({ length: firstDayOfMonth }).map((_, i) => <div key={`empty-${i}`} />)}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const date = new Date(currentYear, currentMonth, day);
              const isPast = date < today;
              const isSelected = date.toDateString() === selectedDate.toDateString();
              return (
                <button
                  key={day}
                  disabled={isPast}
                  onClick={() => handleDateSelect(day)}
                  className={`py-2 text-sm rounded ${
                    isSelected ? 'bg-blue-600 text-white' :
                    isPast ? 'text-gray-300 cursor-not-allowed' :
                    'hover:bg-blue-50 text-gray-700'
                  }`}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>

        {/* Time slots (computed from work hours) */}
        {/* Time slot picker - student chooses time freely within work hours */}
        <div className="mb-6">
          <h4 className="text-sm font-medium text-gray-700 mb-3">Choose Your Time</h4>
          {!workHoursForDay ? (
            <p className="text-sm text-gray-400 italic">
              The facilitator is not available on this day. Please select another date.
            </p>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-gray-500">
                Available hours: <span className="font-medium">{workHoursForDay.startTime} - {workHoursForDay.endTime}</span>
              </p>
              <div className="flex items-center gap-3">
                <input
                  type="time"
                  value={selectedTime}
                  onChange={e => setSelectedTime(e.target.value)}
                  min={workHoursForDay.startTime}
                  max={workHoursForDay.endTime}
                  className="w-full border rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <span className="text-sm text-gray-500 whitespace-nowrap">60 min appointment</span>
              </div>
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
          disabled={!workHoursForDay || isBooking}
          className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 font-medium"
        >
          {isBooking ? 'Booking...' : 'Request Appointment'}
        </button>
      </div>
    </div>
  );
}