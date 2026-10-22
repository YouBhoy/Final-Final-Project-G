import { useCallback, useEffect, useState } from "react";
import { userRepository } from "@spartan-g/shared-services";
import { adminUserListRows, type AdminUserListRow } from '../lib/pseudonymization';

type UserRow = AdminUserListRow;

/**
 * Loads every user document for the Super Admin Users page.
 * Filtering by role (All / Students / Facilitators) happens client-side —
 * the Super Admin's rules allow reading the whole `users` collection.
 */
export function useAdminUsers() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = adminUserListRows(await userRepository.getAll());
      list.sort((a, b) => (a.displayName ?? "").localeCompare(b.displayName ?? ""));
      setUsers(list);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { users, loading, error, reload: load };
}
