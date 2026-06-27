import { useEffect, useState, useCallback } from 'react';
import { userService, workHoursService } from '@spartan-g/shared-services';
import { useAuth } from '../../hooks/useAuth';
import { WorkHoursScheduleDocument } from '@spartan-g/shared-types';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function StudentFindFacilitatorPage() {
  const [facilitators, setFacilitators] = useState<{ id: string; displayName: string; email: string }[]>([]);
  const [workHoursMap, setWorkHoursMap] = useState<{ [key: string]: (WorkHoursScheduleDocument & { id: string })[] }>({});
  const [selectedFacilitator, setSelectedFacilitator] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { user } = useAuth();

  const loadFacilitators = useCallback(async () => {
    if (!user) return;
    try {
      const users = await userService.listUsersByRole('facilitator', user.role);
      const mapped = users.map(u => ({ id: u.id, displayName: u.displayName || 'Facilitator', email: u.email || '' }));
      setFacilitators(mapped);

      // Load work hours for all facilitators
      const whMap: { [key: string]: (WorkHoursScheduleDocument & { id: string })[] } = {};
      for (const fac of mapped) {
        try {
          const schedule = await workHoursService.getActiveSchedule(fac.id, user.role);
          whMap[fac.id] = schedule;
        } catch { /* ignore */ }
      }
      setWorkHoursMap(whMap);
    } catch (error) {
      console.error('Failed to load facilitators:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadFacilitators();
  }, [loadFacilitators]);

  if (isLoading) {
    return <div className="text-center py-12 text-gray-500">Loading facilitators...</div>;
  }

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-xl font-semibold text-gray-900 mb-6">Find a Facilitator</h1>
      <div className="grid md:grid-cols-2 gap-4">
        {facilitators.map(fac => {
          const schedule = workHoursMap[fac.id] || [];
          const activeDays = schedule.filter(s => s.isActive).map(s => DAYS[s.dayOfWeek]);

          return (
            <div
              key={fac.id}
              className="bg-white border rounded-lg p-5 hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => setSelectedFacilitator(selectedFacilitator === fac.id ? null : fac.id)}
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center">
                  <span className="text-lg font-semibold text-indigo-700">
                    {fac.displayName.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">{fac.displayName}</h3>
                  <p className="text-sm text-gray-500">{fac.email}</p>
                </div>
              </div>

              {selectedFacilitator === fac.id && (
                <div className="border-t pt-3 mt-3 space-y-3">
                  <h4 className="text-sm font-medium text-gray-700">Available Hours</h4>
                  {activeDays.length === 0 ? (
                    <p className="text-sm text-gray-400 italic">No availability set</p>
                  ) : (
                    <div className="space-y-1">
                      {schedule.filter(s => s.isActive).map(s => (
                        <div key={s.id} className="flex justify-between text-sm">
                          <span className="text-gray-600">{DAYS[s.dayOfWeek]}</span>
                          <span className="text-gray-800">{s.startTime} - {s.endTime}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <a
                    href={`/student/facilitator/${fac.id}`}
                    className="block w-full text-center px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 mt-3"
                  >
                    Book Appointment
                  </a>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}