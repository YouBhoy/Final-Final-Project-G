import { useEffect, useState, useCallback } from 'react';
import { appointmentSlotService, workHoursService } from '@spartan-g/shared-services';
import { useAuth } from '../../hooks/useAuth';
import { AppointmentSlotDocument } from '@spartan-g/shared-types';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function FacilitatorSlotsPage() {
  const [slots, setSlots] = useState<(AppointmentSlotDocument & { id: string })[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [saving, setSaving] = useState(false);
  const { user } = useAuth();

  const loadSlots = useCallback(async () => {
    if (!user) return;
    try {
      const data = await appointmentSlotService.getSlots(user.uid, user.role);
      setSlots(data);
    } catch (error: any) {
      const errorMsg = error?.message || 'Unknown error';
      console.error('Failed to load slots:', error);
      alert(`Failed to load slots: ${errorMsg}\n\nIf this is a permissions error, please deploy the updated Firestore rules.`);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadSlots();
  }, [loadSlots]);

  const handleCreateSlot = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const [startHour, startMinute] = startTime.split(':').map(Number);
      const [endHour, endMinute] = endTime.split(':').map(Number);
      
      const start = new Date(selectedDate);
      start.setHours(startHour, startMinute, 0, 0);
      
      const end = new Date(selectedDate);
      end.setHours(endHour, endMinute, 0, 0);

      await appointmentSlotService.createSlot({
        facilitatorId: user.uid,
        startTime: start,
        endTime: end,
      }, user.role);

      await loadSlots();
      setShowCreateForm(false);
    } catch (error) {
      console.error('Failed to create slot:', error);
      alert(error instanceof Error ? error.message : 'Failed to create slot');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSlot = async (slotId: string) => {
    if (!user) return;
    if (!confirm('Delete this slot?')) return;
    try {
      await appointmentSlotService.deleteSlot(slotId, user.uid, user.role);
      await loadSlots();
    } catch (error) {
      console.error('Failed to delete slot:', error);
      alert('Failed to delete slot');
    }
  };

  const formatDateTime = (timestamp: any) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  };

  if (isLoading) {
    return <div className="text-center py-12 text-gray-500">Loading slots...</div>;
  }

  const availableSlots = slots.filter(s => s.status === 'available');
  const reservedSlots = slots.filter(s => s.status === 'reserved');
  const completedSlots = slots.filter(s => s.status === 'completed');
  const cancelledSlots = slots.filter(s => s.status === 'cancelled');

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Appointment Slots</h1>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
        >
          {showCreateForm ? 'Cancel' : 'Create Slot'}
        </button>
      </div>

      {showCreateForm && (
        <div className="bg-white rounded-lg shadow-sm border p-6 mb-6">
          <h3 className="text-lg font-semibold mb-4">Create New Slot</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
              <input
                type="date"
                value={selectedDate.toISOString().split('T')[0]}
                onChange={e => setSelectedDate(new Date(e.target.value))}
                min={new Date().toISOString().split('T')[0]}
                className="border rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
                <input
                  type="time"
                  value={startTime}
                  onChange={e => setStartTime(e.target.value)}
                  className="border rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">End Time</label>
                <input
                  type="time"
                  value={endTime}
                  onChange={e => setEndTime(e.target.value)}
                  className="border rounded-lg px-3 py-2 text-sm"
                />
              </div>
            </div>
            <button
              onClick={handleCreateSlot}
              disabled={saving}
              className="w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
            >
              {saving ? 'Creating...' : 'Create Slot'}
            </button>
          </div>
        </div>
      )}

      <div className="space-y-6">
        {/* Available Slots */}
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Available ({availableSlots.length})
          </h2>
          {availableSlots.length === 0 ? (
            <p className="text-sm text-gray-500">No available slots. Create one above.</p>
          ) : (
            <div className="space-y-2">
              {availableSlots.map(slot => (
                <div key={slot.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{formatDateTime(slot.startTime)}</p>
                    <p className="text-xs text-gray-500">
                      {formatDateTime(slot.startTime)} - {formatDateTime(slot.endTime)}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDeleteSlot(slot.id)}
                    className="text-xs text-red-600 hover:text-red-800"
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Reserved Slots */}
        {reservedSlots.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Reserved ({reservedSlots.length})
            </h2>
            <div className="space-y-2">
              {reservedSlots.map(slot => (
                <div key={slot.id} className="flex items-center justify-between p-3 border rounded-lg bg-yellow-50">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{formatDateTime(slot.startTime)}</p>
                    <p className="text-xs text-gray-500">Appointment: {slot.appointmentId}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Completed Slots */}
        {completedSlots.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Completed ({completedSlots.length})
            </h2>
            <div className="space-y-2">
              {completedSlots.map(slot => (
                <div key={slot.id} className="flex items-center justify-between p-3 border rounded-lg bg-green-50">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{formatDateTime(slot.startTime)}</p>
                    <p className="text-xs text-gray-500">Appointment: {slot.appointmentId}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Cancelled Slots */}
        {cancelledSlots.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Cancelled ({cancelledSlots.length})
            </h2>
            <div className="space-y-2">
              {cancelledSlots.map(slot => (
                <div key={slot.id} className="flex items-center justify-between p-3 border rounded-lg bg-gray-50">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{formatDateTime(slot.startTime)}</p>
                    <p className="text-xs text-gray-500">Appointment: {slot.appointmentId || 'N/A'}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}