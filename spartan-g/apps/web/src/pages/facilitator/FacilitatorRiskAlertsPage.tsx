import { useState, useEffect, useMemo } from "react";
import { useAuth } from "../../hooks/useAuth";
import { riskAlertService } from "@spartan-g/shared-services";
import { userRepository } from "@spartan-g/shared-services";
import type { RiskAlertDocument, RiskLevel } from "@spartan-g/shared-types";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { EmptyState } from "../../components/ui/EmptyState";
import { Spinner } from "../../components/ui/Spinner";
import { Modal } from "../../components/ui/Modal";
import { Select } from "../../components/ui/Select";

type AlertWithId = RiskAlertDocument & { id: string };

type StatusFilter = "all" | "open" | "acknowledged" | "resolved";
type SeverityFilter = "all" | "critical" | "high" | "moderate" | "low";

// RiskAlertDocument uses 'medium', RiskLevel uses 'moderate' — handle both
type AlertSeverity = "low" | "medium" | "moderate" | "high" | "critical";

const SEVERITY_ORDER: Record<AlertSeverity, number> = {
  critical: 0,
  high: 1,
  moderate: 2,
  medium: 2,
  low: 3,
};

const SEVERITY_BADGE: Record<AlertSeverity, "danger" | "warning" | "info" | "neutral"> = {
  critical: "danger",
  high: "warning",
  moderate: "info",
  medium: "info",
  low: "neutral",
};

const STATUS_BADGE: Record<string, "success" | "info" | "neutral"> = {
  resolved: "success",
  acknowledged: "info",
  open: "neutral",
};

function formatAlertDate(ts: { toMillis?: () => number } | undefined): string {
  if (!ts || typeof ts.toMillis !== "function") return "—";
  return new Date(ts.toMillis()).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function FacilitatorRiskAlertsPage() {
  const { user } = useAuth();
  const [alerts, setAlerts] = useState<AlertWithId[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const [selectedAlert, setSelectedAlert] = useState<AlertWithId | null>(null);
  const [studentNames, setStudentNames] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);
        const data = await riskAlertService.getAlertsForFacilitator(user!.uid, user!.role);
        if (!cancelled) {
          setAlerts(data as AlertWithId[]);
        }
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : "Failed to load alerts";
          // Surface Firestore permission/index errors clearly
          if (msg.includes('permission') || msg.includes('index')) {
            setError(`${msg}. If this is a new Firebase project, deploy indexes with: firebase deploy --only firestore:indexes`);
          } else {
            setError(msg);
          }
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Load student display names for pseudonymization
  useEffect(() => {
    const uniqueStudentIds = Array.from(new Set(alerts.map((a) => a.studentId)));
    if (uniqueStudentIds.length === 0) return;

    let cancelled = false;
    async function loadNames() {
      const names: Record<string, string> = {};
      await Promise.all(
        uniqueStudentIds.map(async (sid) => {
          try {
            const u = await userRepository.getById(sid);
            if (u && !cancelled) {
              names[sid] = u.displayName || u.email || "Student";
            }
          } catch {
            // ignore
          }
        })
      );
      if (!cancelled) {
        setStudentNames(names);
      }
    }
    loadNames();
    return () => {
      cancelled = true;
    };
  }, [alerts]);

  const filteredAlerts = useMemo(() => {
    let result = [...alerts];

    if (statusFilter !== "all") {
      result = result.filter((a) => a.status === statusFilter);
    }

    if (severityFilter !== "all") {
      result = result.filter((a) => a.severity === severityFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((a) => {
        const name = studentNames[a.studentId] || "";
        return (
          name.toLowerCase().includes(q) ||
          a.title.toLowerCase().includes(q) ||
          a.description.toLowerCase().includes(q)
        );
      });
    }

    // Sort: severity first (critical → high → moderate/medium → low), then newest
    result.sort((a, b) => {
      const severityDiff = (SEVERITY_ORDER[a.severity as AlertSeverity] ?? 3) - (SEVERITY_ORDER[b.severity as AlertSeverity] ?? 3);
      if (severityDiff !== 0) return severityDiff;
      const aTime = a.createdAt?.toMillis?.() ?? 0;
      const bTime = b.createdAt?.toMillis?.() ?? 0;
      return bTime - aTime;
    });

    return result;
  }, [alerts, statusFilter, severityFilter, searchQuery, studentNames]);

  const stats = useMemo(() => {
    const open = alerts.filter((a) => a.status === "open").length;
    const critical = alerts.filter((a) => a.severity === "critical" && a.status !== "resolved").length;
    const high = alerts.filter((a) => a.severity === "high" && a.status !== "resolved").length;
    const resolvedToday = alerts.filter((a) => {
      if (a.status !== "resolved") return false;
      const updated = a.updatedAt?.toMillis?.() ?? 0;
      const now = Date.now();
      return now - updated < 24 * 60 * 60 * 1000;
    }).length;
    return { open, critical, high, resolvedToday };
  }, [alerts]);

  const handleAcknowledge = async (alertId: string) => {
    if (!user) return;
    try {
      await riskAlertService.acknowledgeAlert(alertId, user.role);
      setAlerts((prev) =>
        prev.map((a) => (a.id === alertId ? { ...a, status: "acknowledged" as const } : a))
      );
      setSelectedAlert((prev) => (prev && prev.id === alertId ? { ...prev, status: "acknowledged" as const } : prev));
    } catch {
      // error handled silently
    }
  };

  const handleResolve = async (alertId: string) => {
    if (!user) return;
    try {
      await riskAlertService.resolveAlert(alertId, user.role);
      setAlerts((prev) =>
        prev.map((a) => (a.id === alertId ? { ...a, status: "resolved" as const } : a))
      );
      setSelectedAlert((prev) => (prev && prev.id === alertId ? { ...prev, status: "resolved" as const } : prev));
    } catch {
      // error handled silently
    }
  };

  const getStudentDisplay = (alert: AlertWithId) => {
    const name = studentNames[alert.studentId];
    const showReal = alert.severity === "critical" || alert.severity === "high";
    if (showReal && name) return name;
    return "Student " + alert.studentId.slice(-4);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner label="Loading risk alerts…" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Failed to load alerts: {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">Risk Alerts</h1>
        <p className="mt-1 text-sm text-gray-500">
          Monitor and manage student risk alerts. Critical alerts are shown first.
        </p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card>
          <div className="px-4 py-3">
            <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Open Alerts</div>
            <div className="mt-1 text-2xl font-bold text-gray-900">{stats.open}</div>
          </div>
        </Card>
        <Card>
          <div className="px-4 py-3">
            <div className="text-xs font-medium uppercase tracking-wide text-red-600">Critical</div>
            <div className="mt-1 text-2xl font-bold text-red-700">{stats.critical}</div>
          </div>
        </Card>
        <Card>
          <div className="px-4 py-3">
            <div className="text-xs font-medium uppercase tracking-wide text-amber-600">High</div>
            <div className="mt-1 text-2xl font-bold text-amber-700">{stats.high}</div>
          </div>
        </Card>
        <Card>
          <div className="px-4 py-3">
            <div className="text-xs font-medium uppercase tracking-wide text-green-600">Resolved Today</div>
            <div className="mt-1 text-2xl font-bold text-green-700">{stats.resolvedToday}</div>
          </div>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Search by student name or alert text…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div className="flex gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            >
              <option value="all">All Statuses</option>
              <option value="open">Open</option>
              <option value="acknowledged">Acknowledged</option>
              <option value="resolved">Resolved</option>
            </select>
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value as SeverityFilter)}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            >
              <option value="all">All Severities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="moderate">Moderate</option>
              <option value="low">Low</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Alert table */}
      {filteredAlerts.length === 0 ? (
        <EmptyState
          title="No alerts found"
          description={
            alerts.length === 0
              ? "No risk alerts have been created yet. Alerts will appear here when students submit assessments with elevated risk scores."
              : "Try adjusting your filters or search query."
          }
        />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Severity
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Student
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Alert
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Date
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {filteredAlerts.map((alert) => (
                  <tr key={alert.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <Badge variant={SEVERITY_BADGE[alert.severity as AlertSeverity]}>
                        {alert.severity.charAt(0).toUpperCase() + alert.severity.slice(1)}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">
                      {getStudentDisplay(alert)}
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-gray-900">{alert.title}</div>
                      <div className="mt-0.5 line-clamp-1 text-xs text-gray-500">{alert.description}</div>
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <Badge variant={STATUS_BADGE[alert.status]}>
                        {alert.status.charAt(0).toUpperCase() + alert.status.slice(1)}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700">
                      {formatAlertDate(alert.createdAt)}
                    </td>
                    <td className="px-6 py-4 text-right text-sm">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setSelectedAlert(alert)}
                        >
                          View Details
                        </Button>
                        {alert.status === "open" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleAcknowledge(alert.id)}
                          >
                            Acknowledge
                          </Button>
                        )}
                        {(alert.status === "open" || alert.status === "acknowledged") && (
                          <Button
                            size="sm"
                            onClick={() => handleResolve(alert.id)}
                          >
                            Resolve
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Alert Details Modal */}
      {selectedAlert && (
        <AlertDetailModal
          alert={selectedAlert}
          studentName={studentNames[selectedAlert.studentId] || null}
          onClose={() => setSelectedAlert(null)}
          onAcknowledge={() => handleAcknowledge(selectedAlert.id)}
          onResolve={() => handleResolve(selectedAlert.id)}
        />
      )}
    </div>
  );
}

interface AlertDetailModalProps {
  alert: AlertWithId;
  studentName: string | null;
  onClose: () => void;
  onAcknowledge: () => void;
  onResolve: () => void;
}

function AlertDetailModal({ alert, studentName, onClose, onAcknowledge, onResolve }: AlertDetailModalProps) {
  const showRealName = alert.severity === "critical" || alert.severity === "high";
  const displayName = showRealName && studentName ? studentName : "Student " + alert.studentId.slice(-4);

  const riskScore = alert.overallRiskScore ?? 0;
  const riskLevel = alert.severity as AlertSeverity;
  const riskFlags = alert.riskFlags ?? [];

  // Build timeline from alert metadata
  const timelineEvents = [
    { label: "Assessment Submitted", date: alert.createdAt, icon: "📝" },
    { label: "Risk Alert Created", date: alert.createdAt, icon: "⚠️" },
  ];

  return (
    <Modal open={!!alert} onClose={onClose} title={alert.title} description={alert.description} size="2xl">
      <div className="space-y-6">
        {/* Student info */}
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-gray-900">Student</div>
            <div className="text-sm text-gray-700">{displayName}</div>
          </div>
          <div className="text-right">
            <div className="text-sm font-medium text-gray-900">Alert ID</div>
            <div className="text-xs text-gray-500">{alert.id}</div>
          </div>
        </div>

        {/* Risk summary */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Risk Score</div>
            <div className="mt-1 text-xl font-bold text-gray-900">{riskScore}/100</div>
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Risk Level</div>
            <div className="mt-1">
              <Badge variant={SEVERITY_BADGE[riskLevel]}>
                {riskLevel.charAt(0).toUpperCase() + riskLevel.slice(1)}
              </Badge>
            </div>
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Status</div>
            <div className="mt-1">
              <Badge variant={STATUS_BADGE[alert.status]}>
                {alert.status.charAt(0).toUpperCase() + alert.status.slice(1)}
              </Badge>
            </div>
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Created</div>
            <div className="mt-1 text-sm text-gray-900">{formatAlertDate(alert.createdAt)}</div>
          </div>
        </div>

        {/* Risk flags */}
        {riskFlags.length > 0 && (
          <div>
            <div className="text-sm font-medium text-gray-900">Risk Flags</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {riskFlags.map((flag, idx) => (
                <Badge key={idx} variant={flag.severity === "critical" ? "danger" : flag.severity === "high" ? "warning" : "info"}>
                  {flag.label}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Timeline */}
        <div>
          <div className="text-sm font-medium text-gray-900">Timeline</div>
          <div className="mt-3 space-y-3">
            {timelineEvents.map((event, idx) => (
              <div key={idx} className="flex items-start gap-3">
                <div className="mt-0.5 text-lg">{event.icon}</div>
                <div className="flex-1">
                  <div className="text-sm font-medium text-gray-900">{event.label}</div>
                  <div className="text-xs text-gray-500">{formatAlertDate(event.date)}</div>
                </div>
              </div>
            ))}
            {alert.status === "acknowledged" && (
              <div className="flex items-start gap-3">
                <div className="mt-0.5 text-lg">👁</div>
                <div className="flex-1">
                  <div className="text-sm font-medium text-gray-900">Facilitator Acknowledged</div>
                  <div className="text-xs text-gray-500">{formatAlertDate(alert.updatedAt)}</div>
                </div>
              </div>
            )}
            {alert.status === "resolved" && (
              <div className="flex items-start gap-3">
                <div className="mt-0.5 text-lg">✅</div>
                <div className="flex-1">
                  <div className="text-sm font-medium text-gray-900">Risk Resolved</div>
                  <div className="text-xs text-gray-500">{formatAlertDate(alert.updatedAt)}</div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 border-t border-gray-200 pt-4">
          {alert.status === "open" && (
            <Button variant="outline" onClick={onAcknowledge}>
              Acknowledge
            </Button>
          )}
          {(alert.status === "open" || alert.status === "acknowledged") && (
            <Button onClick={onResolve}>Resolve</Button>
          )}
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
}