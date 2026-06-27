import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { appointmentSlotService, appointmentService, userService } from '@spartan-g/shared-services';
import { useAuth } from '../../hooks/useAuth';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function StudentBookAppointmentPage() {
  const { facilitatorId } = useParams<{ facilitatorId: string }>();
  const navigate = useNavigate();
  const [facilitator, setFacilitator] = useState<{ displayName: string; email: string } | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [availableSlots, setAvailableSlots] = useState<any[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<any | null>(null);
  const [notes, setNotes] = useState('');
  const [isBooking, setIsBooking] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [bookingMessage, setBookingMessage] = useState('');
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
    const startOfMonth = new Date(currentYear, currentMonth, 1);
    const endOfMonth = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59);
    appointmentSlotService.getAvailableSlotsByDateRange(facilitatorId, startOfMonth, endOfMonth, user.role)
      .then(setAvailableSlots)
      .catch(() => setAvailableSlots([]));
  }, [facilitatorId, currentMonth, currentYear, user]);

  const slotsForSelectedDate = useMemo(() => {
    if (!selectedDate) return [];
    return availableSlots.filter(slot => {
      const slotDate = slot.startTime.toDate();
      return slotDate.toDateString() === selectedDate.toDateString();
    });
  }, [availableSlots, selectedDate]);

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
    setSelectedSlot(null);
    setSelectedDate(new Date(currentYear, currentMonth, day));
  };

  const handleBook = async () => {
    if (!user || !facilitatorId || !selectedSlot) return;
    setIsBooking(true);
    try {
      const scheduledAt = selectedSlot.startTime.toDate();
      
      // Reserve the slot
      await appointmentSlotService.reserveSlot(selectedSlot.id, 'pending', user.role);
      
      // Create the appointment
      const appointmentId = await appointmentService.requestAppointment({
        studentId: user.uid,
        facilitatorId,
        scheduledAt,
        durationMinutes: 60,
        notes: notes || undefined,
      }, user.role);

      // Link slot to appointment
      await appointmentSlotService.reserveSlot(selectedSlot.id, appointmentId, user.role);
      
      setBookingMessage('Appointment requested successfully!');
      setTimeout(() => navigate('/student/appointments'), 2000);
    } catch (error) {
      console.error('Failed to book appointment:', error);
      alert('Failed to book appointment. The slot may no longer be available.');
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
        </div>

        {/* Calendar */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <button onClick={prevMonth} className="p-2 hover:bg-gray-100 rounded">&larr;</button>
            <h3 className="font-medium">{MONTHS[currentMonth]} {currentYear}</h3>
            <button onClick={nextMonth} className="p-2 hover:bg-gray-100 rounded">&rarr;</button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center">
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(d => <div key={d} className="text-xs font-medium text-gray-500 py-1">{d}</div>)}
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

        {/* Time slots */}
        <div className="mb-6">
          <h4 className="text-sm font-medium text-gray-700 mb-3">Available Slots</h4>
          {slotsForSelectedDate.length === 0 ? (
            <p className="text-sm text-gray-400 italic">No available slots for this date</p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {slotsForSelectedDate.map(slot => {
                const start = slot.startTime.toDate();
                const timeStr = start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
                const isSelected = selectedSlot?.id === slot.id;
                return (
                  <button
                    key={slot.id}
                    onClick={() => setSelectedSlot(slot)}
                    className={`py-2 px-3 text-sm rounded border ${
                      isSelected
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'hover:bg-blue-50 border-gray-200 text-gray-700'
                    }`}
                  >
                    {timeStr}
                  </button>
                );
              })}
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
          disabled={!selectedSlot || isBooking}
          className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 font-medium"
        >
          {isBooking ? 'Booking...' : 'Request Appointment'}
        </button>
      </div>
    </div>
  );
}