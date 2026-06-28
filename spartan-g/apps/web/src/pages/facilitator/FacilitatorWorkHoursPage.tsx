import { useEffect, useState, useCallback } from 'react';
import { workHoursService } from '@spartan-g/shared-services';
import { useAuth } from '../../hooks/useAuth';
import { WorkHoursScheduleDocument } from '@spartan-g/shared-types';
import { workHoursRepository } from '@spartan-g/shared-services';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function FacilitatorWorkHoursPage() {
  const [schedules, setSchedules] = useState<(WorkHoursScheduleDocument & { id: string })[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingDay, setEditingDay] = useState<number | null>(null);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('17:00');
  const [saving, setSaving] = useState(false);
  const { user } = useAuth();

  const loadSchedules = useCallback(async () => {
    if (!user) return;
    try {
      const data = await workHoursService.getSchedule(user.uid, user.role);
      setSchedules(data);
    } catch (error) {
      console.error('Failed to load work hours:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadSchedules();
  }, [loadSchedules]);

  const handleToggleDay = async (dayOfWeek: number) => {
    console.log('=== TOGGLE DAY CLICKED ===');
    console.log('dayOfWeek:', dayOfWeek);
    console.log('user:', user);
    console.log('schedules:', schedules);
    
    if (!user) {
      console.log('NO USER - aborting');
      return;
    }
    
    const existing = schedules.find(s => s.dayOfWeek === dayOfWeek);
    console.log('existing schedule:', existing);
    
    try {
      if (existing) {
        console.log('Toggling existing schedule:', existing.id, 'to', !existing.isActive);
        await workHoursService.toggleSchedule(existing.id, !existing.isActive, user.role);
      } else {
        console.log('Creating new schedule for day:', dayOfWeek);
        await workHoursService.createScheduleEntry({
          facilitatorId: user.uid,
          dayOfWeek,
          startTime: '09:00',
          endTime: '17:00',
        }, user.role);
      }
      console.log('Reloading schedules...');
      await loadSchedules();
      console.log('Success!');
    } catch (error) {
      console.error('=== TOGGLE DAY ERROR ===');
      console.error('Error object:', error);
      console.error('Error message:', error instanceof Error ? error.message : 'Unknown');
      console.error('Error stack:', error instanceof Error ? error.stack : 'N/A');
      alert(error instanceof Error ? error.message : 'Failed to toggle day');
    }
  };

  const handleSaveTime = async (dayOfWeek: number) => {
    if (!user) return;
    setSaving(true);
    try {
      const existing = schedules.find(s => s.dayOfWeek === dayOfWeek);
      if (existing) {
        await workHoursService.updateScheduleEntry(existing.id, {
          startTime,
          endTime,
          isActive: true,
        } as Partial<WorkHoursScheduleDocument>, user.role);
      } else {
        await workHoursService.createScheduleEntry({
          facilitatorId: user.uid,
          dayOfWeek,
          startTime,
          endTime,
        }, user.role);
      }
      await loadSchedules();
      setEditingDay(null);
    } catch (error) {
      console.error('Failed to save work hours:', error);
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (dayOfWeek: number) => {
    const existing = schedules.find(s => s.dayOfWeek === dayOfWeek);
    setStartTime(existing?.startTime || '09:00');
    setEndTime(existing?.endTime || '17:00');
    setEditingDay(dayOfWeek);
  };

  if (isLoading) {
    return <div className="text-center py-12 text-gray-500">Loading work hours...</div>;
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <h1 className="text-xl font-semibold text-gray-900 mb-2">Work Hours</h1>
        <p className="text-sm text-gray-500 mb-6">
          Set your weekly availability. Students can book appointments during active hours.
        </p>

        <div className="space-y-3">
          {DAYS.map((day, index) => {
            const schedule = schedules.find(s => s.dayOfWeek === index);
            const isActive = schedule?.isActive ?? false;
            const isEditing = editingDay === index;

            return (
              <div key={index} className="flex items-center gap-4 p-3 border rounded-lg">
                <button
                  onClick={() => handleToggleDay(index)}
                  className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                    isActive ? 'bg-blue-600 border-blue-600' : 'border-gray-300'
                  }`}
                >
                  {isActive && (
                    <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>

                <span className={`w-28 font-medium text-sm ${isActive ? 'text-gray-900' : 'text-gray-400'}`}>
                  {day}
                </span>

                {isEditing ? (
                  <div className="flex items-center gap-2 flex-1">
                    <input
                      type="time"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      className="border rounded px-2 py-1 text-sm"
                    />
                    <span className="text-gray-500">to</span>
                    <input
                      type="time"
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      className="border rounded px-2 py-1 text-sm"
                    />
                    <button
                      onClick={() => handleSaveTime(index)}
                      disabled={saving}
                      className="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 disabled:bg-gray-400"
                    >
                      {saving ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      onClick={() => setEditingDay(null)}
                      className="px-3 py-1 text-gray-600 text-xs hover:text-gray-800"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <span className={`flex-1 text-sm ${isActive ? 'text-gray-600' : 'text-gray-400 italic'}`}>
                    {isActive ? `${schedule?.startTime || '09:00'} - ${schedule?.endTime || '17:00'}` : 'Inactive'}
                  </span>
                )}

                {!isEditing && isActive && (
                  <button
                    onClick={() => startEdit(index)}
                    className="text-xs text-blue-600 hover:text-blue-800"
                  >
                    Edit
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}