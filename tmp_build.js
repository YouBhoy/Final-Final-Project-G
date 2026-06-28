const fs = require(`fs`);import { useEffect, useState, useCallback } from 'react';

import { userService, workHoursService } from '@spartan-g/shared-services';
import { useAuth } from '../../hooks/useAuth';
import { WorkHoursScheduleDocument } from '@spartan-g/shared-types';

const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

export function StudentFindFacilitatorPage() {
  const [facilitators, setFacilitators] = useState([]);
  const [workHoursMap, setWorkHoursMap] = useState({});
  const [selectedFacilitator, setSelectedFacilitator] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const { user, status } = useAuth();

  useEffect(() => {
    if (!user || status !== 'authenticated') { setIsLoading(false); return; }

    let cancelled = false;
    const loadFacilitators = async () => {
      try {
        setError(null); setFacilitators([]); setWorkHoursMap({});

        const users = await userService.listUsersByRole('facilitator', user.role);
        if (cancelled) return;

        const mapped = users.map(u => ({
          id: u.id, displayName: u.displayName || 'Facilitator', email: u.email || ''
        })); setFacilitators(mapped);

        const whMap = {};
        await Promise.allSettled(mapped.map(async (fac) => {
          try {
            const schedule = await workHoursService.getActiveSchedule(fac.id, user.role);
            whMap[fac.id] = schedule;
          } catch { whMap[fac.id] = []; }
        })); if (!cancelled) setWorkHoursMap(whMap);
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : 'Failed to load facilitators.';
          setError(msg); console.error('[StudentFindFacilitatorPage] load error:', err);
        }
      } finally { if (!cancelled) setIsLoading(false); }
    };

    loadFacilitators();
    return () => { cancelled = true; };
  }, [user?.role, status]);


