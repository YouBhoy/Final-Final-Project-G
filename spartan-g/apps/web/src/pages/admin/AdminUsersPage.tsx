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
import { Avatar } from "../../components/ui/Avatar";

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

      <p className="text-sm text-gray-600">Student names remain pseudonymous; account login emails are shown for account management. Passwords are never displayed.</p>

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
          <div className="divide-y divide-gray-200 lg:hidden">
            {filtered.map((u) => (
              <article key={u.id} className="min-w-0 space-y-3 p-4">
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar name={u.displayName || u.email || '?'} size="sm" />
                  <div className="min-w-0 flex-1">
                    <button type="button" onClick={() => navigate(`/admin/users/${u.id}`)} className="max-w-full truncate text-left text-sm font-semibold text-indigo-700 hover:underline">
                      {u.displayName || "—"}{u.id === actor?.uid && <span className="ml-1.5 text-xs text-gray-400">(you)</span>}
                    </button>
                    <p className="break-all text-xs text-gray-600">{u.email || "—"}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">Role</span><Badge variant={ROLE_BADGE[u.role] ?? "neutral"}>{ROLE_LABELS[u.role] ?? u.role}</Badge></div>
                  <div><span className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">Status</span>{u.isActive ? <Badge variant="success">Active</Badge> : <Badge variant="danger">Inactive</Badge>}</div>
                  <div className="col-span-2 min-w-0"><span className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">Campus</span><p className="break-words text-sm text-gray-700">{u.campus ? (CAMPUS_LABELS[u.campus] ?? u.campus) : "—"}</p></div>
                </div>
                <div className="flex flex-wrap gap-2 border-t border-gray-100 pt-2">
                  <button type="button" onClick={() => navigate(`/admin/users/${u.id}`)} className="rounded-md px-2.5 py-1.5 text-sm text-indigo-600 hover:bg-indigo-50">View</button>
                  {u.role === ROLES.STUDENT && actor?.role === ROLES.SUPER_ADMIN && (
                    <button type="button" onClick={() => setOverrideStudent({ id: u.id, name: u.displayName || u.email || "this student" })} className="rounded-md px-2.5 py-1.5 text-sm text-amber-700 hover:bg-amber-50">Override</button>
                  )}
                </div>
              </article>
            ))}
          </div>
          <div className="hidden w-full lg:block">
            <table className="w-full table-fixed divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {["Name / Alias", "Email", "Role", "Campus", "Status"].map((h) => (
                    <th
                      key={h}
                      className={`px-2 py-3 text-left text-[10px] font-medium uppercase tracking-wide text-gray-500 sm:px-3 sm:text-xs ${h === "Name / Alias" ? "w-[19%]" : h === "Email" ? "w-[22%]" : h === "Role" ? "w-[12%]" : h === "Campus" ? "w-[18%]" : "w-[11%]"}`}
                    >
                      {h}
                    </th>
                  ))}
                  <th className="w-[18%] px-2 py-3 text-right text-[10px] font-medium uppercase tracking-wide text-gray-500 sm:px-3 sm:text-xs">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {filtered.map((u) => (
                  <tr
                    key={u.id}
                    className="hover:bg-gray-50"
                    onClick={() => navigate(`/admin/users/${u.id}`)}
                  >
                    <td className="break-words px-2 py-3 sm:px-3 sm:py-4">
                      <div className="flex items-center gap-3">
                        <Avatar name={u.displayName || u.email || '?'} size="xs" />
                        <span className="min-w-0 break-words text-xs font-medium text-gray-900 sm:text-sm">
                          {u.displayName || "—"}
                          {u.id === actor?.uid && (
                            <span className="ml-1.5 text-xs text-gray-400">(you)</span>
                          )}
                        </span>
                      </div>
                    </td>
                    <td className="break-all px-2 py-3 text-xs text-gray-700 sm:px-3 sm:py-4 sm:text-sm">
                      {u.email || "—"}
                    </td>
                    <td className="px-2 py-3 sm:px-3 sm:py-4">
                      <Badge variant={ROLE_BADGE[u.role] ?? "neutral"}>
                        {ROLE_LABELS[u.role] ?? u.role}
                      </Badge>
                    </td>
                    <td className="break-words px-2 py-3 text-xs text-gray-700 sm:px-3 sm:py-4 sm:text-sm">
                      {u.campus ? (CAMPUS_LABELS[u.campus] ?? u.campus) : "—"}
                    </td>
                    <td className="px-2 py-3 sm:px-3 sm:py-4">
                      {u.isActive ? (
                        <Badge variant="success">Active</Badge>
                      ) : (
                        <Badge variant="danger">Inactive</Badge>
                      )}
                    </td>
                    <td className="break-words px-1 py-3 text-right text-[11px] sm:px-2 sm:py-4 sm:text-sm">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/admin/users/${u.id}`);
                        }}
                        className="rounded-md px-1.5 py-1 text-indigo-600 hover:bg-indigo-50 sm:px-2.5"
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
                          className="ml-1 rounded-md px-1.5 py-1 text-amber-700 hover:bg-amber-50 sm:px-2.5"
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
