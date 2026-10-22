import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAdminUsers } from "../../hooks/useAdminUsers";
import { useAuth } from "../../hooks/useAuth";
import { Badge } from "../../components/ui/Badge";
import { Card } from "../../components/ui/Card";
import { EmptyState } from "../../components/ui/EmptyState";
import { Spinner } from "../../components/ui/Spinner";
import { Input } from "../../components/ui/Input";
import { CAMPUS_LABELS, ROLE_LABELS, ROLES } from "@spartan-g/shared-types";
import type { Role } from "@spartan-g/shared-types";
import { AssessmentOverrideDialog } from "../../components/admin/AssessmentOverrideDialog";

type RoleFilter = "all" | Role;

const ROLE_BADGE: Record<Role, "info" | "warning" | "default"> = {
  student: "info",
  facilitator: "warning",
  super_admin: "default",
};

/**
 * Super Admin — User Management.
 *
 * Filter by role and search visible names, aliases or staff emails,
 * and open a user's detail page to view or edit their profile. Reads the
 * same `users` collection every portal uses.
 */
export function AdminUsersPage() {
  const { user: actor } = useAuth();
  const { users, loading, error } = useAdminUsers();
  const [params, setParams] = useSearchParams();
  const requestedRole = params.get('role');
  const filter: RoleFilter = requestedRole === 'student' || requestedRole === 'facilitator' || requestedRole === 'super_admin' ? requestedRole : 'all';
  const campusFilter = params.get('campus');
  function setFilter(role: RoleFilter) {
    setParams(current => {
      const next = new URLSearchParams(current);
      if (role === 'all') next.delete('role'); else next.set('role', role);
      return next;
    });
  }
  const [search, setSearch] = useState("");
  const [overrideStudent, setOverrideStudent] = useState<{ id: string; name: string } | null>(null);
  const navigate = useNavigate();

  const campusUsers = useMemo(() => users.filter(user => !campusFilter || user.campus === campusFilter), [users, campusFilter]);
  const counts = useMemo(
    () => ({
      all: campusUsers.length,
      student: campusUsers.filter((u) => u.role === ROLES.STUDENT).length,
      facilitator: campusUsers.filter((u) => u.role === ROLES.FACILITATOR).length,
      super_admin: campusUsers.filter((u) => u.role === ROLES.SUPER_ADMIN).length,
    }),
    [campusUsers],
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return users.filter((u) => {
      if (filter !== "all" && u.role !== filter) return false;
      if (campusFilter && u.campus !== campusFilter) return false;
      if (!term) return true;
      return (
        (u.displayName ?? "").toLowerCase().includes(term) ||
        (u.email ?? "").toLowerCase().includes(term)
      );
    });
  }, [users, filter, search, campusFilter]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner label="Loading users…" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Failed to load users: {error.message}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
          User Management
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          View and manage student, facilitator, and admin accounts.
        </p>
      </div>

      {campusFilter && <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600"><span>Campus: {CAMPUS_LABELS[campusFilter] ?? campusFilter}</span><button type="button" className="font-semibold text-[var(--color-primary)] hover:underline" onClick={() => setParams(current => { const next = new URLSearchParams(current); next.delete('campus'); return next; })}>Clear campus filter</button></div>}
      {/* Filter bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="block w-full text-sm font-medium text-gray-700 sm:w-64">
          Role
          <select value={filter} onChange={event => setFilter(event.target.value as RoleFilter)} className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="all">All Users ({counts.all})</option>
            <option value="student">Students ({counts.student})</option>
            <option value="facilitator">Facilitators ({counts.facilitator})</option>
            <option value="super_admin">Super Admins ({counts.super_admin})</option>
          </select>
        </label>
        <div className="w-full sm:max-w-xs">
          <Input
            label="Search"
            placeholder="Search by alias or staff name/email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <p className="text-sm text-gray-600">Students use random aliases and hidden emails. Search students by their alias; identities stay hidden when opening an account until explicitly revealed for account management.</p>

      {filtered.length === 0 ? (
        <EmptyState
          title="No users found"
          description={
            search
              ? "No users match your search."
              : campusFilter
                ? "No users match the selected campus and role."
                : "Users will appear here once accounts are registered."
          }
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {["Name / Alias", "Email", "Role", "Campus", "Status"].map((h) => (
                    <th
                      key={h}
                      className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
                    >
                      {h}
                    </th>
                  ))}
                  <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {filtered.map((u) => (
                  <tr
                    key={u.id}
                    className="cursor-pointer hover:bg-gray-50"
                    onClick={() => navigate(`/admin/users/${u.id}`)}
                  >
                    <td className="whitespace-nowrap px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-700">
                          {(u.displayName || u.email || "?").charAt(0).toUpperCase()}
                        </div>
                        <span className="text-sm font-medium text-gray-900">
                          {u.displayName || "—"}
                          {u.id === actor?.uid && (
                            <span className="ml-1.5 text-xs text-gray-400">(you)</span>
                          )}
                        </span>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-700">
                      {u.email}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <Badge variant={ROLE_BADGE[u.role] ?? "neutral"}>
                        {ROLE_LABELS[u.role] ?? u.role}
                      </Badge>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-700">
                      {u.campus ? (CAMPUS_LABELS[u.campus] ?? u.campus) : "—"}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      {u.isActive ? (
                        <Badge variant="success">Active</Badge>
                      ) : (
                        <Badge variant="danger">Inactive</Badge>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-right text-sm">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/admin/users/${u.id}`);
                        }}
                        className="rounded-md px-2.5 py-1 text-indigo-600 hover:bg-indigo-50"
                      >
                        View
                      </button>
                      {u.role === ROLES.STUDENT && actor?.role === ROLES.SUPER_ADMIN && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setOverrideStudent({ id: u.id, name: u.displayName || u.email || "this student" });
                          }}
                          className="ml-1 rounded-md px-2.5 py-1 text-amber-700 hover:bg-amber-50"
                        >
                          Override
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {actor && overrideStudent && (
        <AssessmentOverrideDialog
          open
          onClose={() => setOverrideStudent(null)}
          student={overrideStudent}
          actorRole={actor.role}
        />
      )}
    </div>
  );
}
