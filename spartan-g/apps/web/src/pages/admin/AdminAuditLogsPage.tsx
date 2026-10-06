import { useEffect, useState } from "react";
import { auditService } from "@spartan-g/shared-services";
import { getErrorMessage, type AuditLogDocument } from "@spartan-g/shared-types";
import { Badge } from "../../components/ui/Badge";
import { Card } from "../../components/ui/Card";
import { EmptyState } from "../../components/ui/EmptyState";
import { Spinner } from "../../components/ui/Spinner";

type AuditRow = AuditLogDocument & { id: string };

function actionVariant(action: string): "info" | "warning" | "danger" | "neutral" | "success" {
  if (action.includes("DELETED")) return "danger";
  if (action.includes("PASSWORD")) return "warning";
  if (action.includes("CREATED")) return "success";
  if (action.includes("RESOURCE")) return "info";
  return "neutral";
}

function formatTime(row: AuditRow): string {
  const t = row.createdAt as { toDate?: () => Date } | undefined;
  return t?.toDate ? t.toDate().toLocaleString() : "—";
}

/**
 * Super Admin — Audit Log viewer.
 *
 * Reads the existing `audit_logs` collection (read rule: super admin only,
 * append-only). Entries are written by the admin UI and by the
 * adminSetUserPassword / adminUpdateUser Cloud Functions.
 */
export function AdminAuditLogsPage() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await auditService.listRecent(100);
        if (!cancelled) setRows(list as AuditRow[]);
      } catch (err) {
        if (!cancelled) setError(getErrorMessage(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner label="Loading audit log…" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Failed to load audit log: {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
          Audit Log
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Append-only trail of privileged Super Admin actions (most recent 100 entries).
        </p>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="No audit entries yet"
          description="Privileged actions such as profile edits, password changes, and resource management will appear here."
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {["When", "Actor", "Action", "Target", "Details"].map((h) => (
                    <th
                      key={h}
                      className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-gray-50">
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-700">
                      {formatTime(row)}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700">
                      <div className="font-medium text-gray-900">
                        {(row.metadata?.adminEmail as string) ?? row.actorId}
                      </div>
                      <div className="font-mono text-xs text-gray-400">{row.actorId}</div>
                    </td>
                    <td className="px-6 py-4">
                      <Badge variant={actionVariant(row.action)}>{row.action}</Badge>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700">
                      <div>{(row.metadata?.targetUserRole as string) ?? row.resource}</div>
                      <div className="font-mono text-xs text-gray-400">{row.resourceId}</div>
                    </td>
                    <td className="px-6 py-4 text-xs text-gray-500">
                      {row.metadata?.changedFields
                        ? `Changed: ${(row.metadata.changedFields as string[]).join(", ")}`
                        : row.metadata?.resourceName
                          ? String(row.metadata.resourceName)
                          : "—"}
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
