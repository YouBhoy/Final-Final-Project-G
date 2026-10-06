import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAdminUsers } from "../../hooks/useAdminUsers";
import { useAuth } from "../../hooks/useAuth";
import { Badge } from "../../components/ui/Badge";
import { Card } from "../../components/ui/Card";
import { EmptyState } from "../../components/ui/EmptyState";
import { Spinner } from "../../components/ui/Spinner";
import { Input } from "../../components/ui/Input";
import { CAMPUS_LABELS, ROLE_LABELS, ROLES } from "@spartan-g/shared-types";
import type { Role } from "@spartan-g/shared-types";

type RoleFilter = "all" | "student" | "facilitator";

const ROLE_BADGE: Record<Role, "info" | "warning" | "default"> = {
  student: "info",
  facilitator: "warning",
  super_admin: "default",
};

/**
 * Super Admin — User Management.
 *
 * Filter by All Users / Students / Facilitators, search by name or email,
 * and open a user's detail page to view or edit their profile. Reads the
 * same `users` collection every portal uses.
 */
export function AdminUsersPage() {
  const { user: actor } = useAuth();
  const { users, loading, error } = useAdminUsers();
  const [filter, setFilter] = useState<RoleFilter>("all");
  const [search, setSearch] = useState("");
  const navigate = useNavigate();

  const counts = useMemo(
    () => ({
      all: users.length,
      student: users.filter((u) => u.role === ROLES.STUDENT).length,
      facilitator: users.filter((u) => u.role === ROLES.FACILITATOR).length,
    }),
    [users],
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return users.filter((u) => {
      if (filter !== "all" && u.role !== filter) return false;
      if (!term) return true;
      return (
        (u.displayName ?? "").toLowerCase().includes(term) ||
        (u.email ?? "").toLowerCase().includes(term)
      );
    });
  }, [users, filter, search]);

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

      {/* Filter bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {(["all", "student", "facilitator"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                filter === f
                  ? "bg-indigo-100 text-indigo-700"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              {f === "all"
                ? `All Users (${counts.all})`
                : f === "student"
                  ? `Students (${counts.student})`
                  : `Facilitators (${counts.facilitator})`}
            </button>
          ))}
        </div>
        <div className="w-full sm:max-w-xs">
          <Input
            label="Search"
            placeholder="Search by name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="No users found"
          description={
            search
              ? "No users match your search."
              : "Users will appear here once accounts are registered."
          }
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {["Name", "Email", "Role", "Campus", "Status"].map((h) => (
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
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
