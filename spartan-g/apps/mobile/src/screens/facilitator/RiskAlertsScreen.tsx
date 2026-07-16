import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TextInput,
  Modal,
} from 'react-native';
import { useAuthStore, riskAlertService, userRepository } from '@spartan-g/shared-services';
import type { RiskAlertDocument, RiskLevel } from '@spartan-g/shared-types';
import { lightColors } from '@spartan-g/shared-ui';

type AlertWithId = RiskAlertDocument & { id: string };
type StatusFilter = 'all' | 'open' | 'acknowledged' | 'resolved';
type SeverityFilter = 'all' | 'critical' | 'high' | 'moderate' | 'low';
type AlertSeverity = 'low' | 'medium' | 'moderate' | 'high' | 'critical';

const SEVERITY_ORDER: Record<AlertSeverity, number> = {
  critical: 0,
  high: 1,
  moderate: 2,
  medium: 2,
  low: 3,
};

function getSeverityColor(severity: AlertSeverity): string {
  switch (severity) {
    case 'critical': return lightColors.criticalText;
    case 'high': return lightColors.warningText;
    case 'moderate':
    case 'medium': return lightColors.infoBadgeText;
    case 'low': return lightColors.textSecondary;
  }
}

function getSeverityBg(severity: AlertSeverity): string {
  switch (severity) {
    case 'critical': return lightColors.criticalBackground;
    case 'high': return lightColors.warningBackground;
    case 'moderate':
    case 'medium': return lightColors.infoBackground;
    case 'low': return lightColors.neutralBackground;
  }
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'resolved': return lightColors.successText;
    case 'acknowledged': return lightColors.infoBadgeText;
    default: return lightColors.textSecondary;
  }
}

function getStatusBg(status: string): string {
  switch (status) {
    case 'resolved': return lightColors.successBackground;
    case 'acknowledged': return lightColors.infoBackground;
    default: return lightColors.neutralBackground;
  }
}

function formatAlertDate(ts: { toMillis?: () => number } | undefined): string {
  if (!ts || typeof ts.toMillis !== 'function') return '—';
  return new Date(ts.toMillis()).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function RiskAlertsScreen() {
  const session = useAuthStore((s) => s.session);

  const [alerts, setAlerts] = useState<AlertWithId[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [selectedAlert, setSelectedAlert] = useState<AlertWithId | null>(null);
  const [studentNames, setStudentNames] = useState<Record<string, string>>({});
  const [acknowledging, setAcknowledging] = useState<string | null>(null);
  const [resolving, setResolving] = useState<string | null>(null);

  // Load alerts
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    const uid = session.uid;
    const role = session.role;

    async function load() {
      try {
        setLoading(true);
        setError(null);
        const data = await riskAlertService.getAlertsForFacilitator(uid, role);
        if (!cancelled) {
          setAlerts(data as AlertWithId[]);
        }
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : 'Failed to load alerts';
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
    return () => { cancelled = true; };
  }, [session]);

  // Load student display names
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
              names[sid] = u.displayName || u.email || 'Student';
            }
          } catch {
            // ignore
          }
        }),
      );
      if (!cancelled) {
        setStudentNames(names);
      }
    }
    loadNames();
    return () => { cancelled = true; };
  }, [alerts]);

  const filteredAlerts = useMemo(() => {
    let result = [...alerts];

    if (statusFilter !== 'all') {
      result = result.filter((a) => a.status === statusFilter);
    }
    if (severityFilter !== 'all') {
      result = result.filter((a) => a.severity === severityFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((a) => {
        const name = studentNames[a.studentId] || '';
        return (
          name.toLowerCase().includes(q) ||
          a.title.toLowerCase().includes(q) ||
          a.description.toLowerCase().includes(q)
        );
      });
    }

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
    const open = alerts.filter((a) => a.status === 'open').length;
    const critical = alerts.filter((a) => a.severity === 'critical' && a.status !== 'resolved').length;
    const high = alerts.filter((a) => a.severity === 'high' && a.status !== 'resolved').length;
    const resolvedToday = alerts.filter((a) => {
      if (a.status !== 'resolved') return false;
      const updated = a.updatedAt?.toMillis?.() ?? 0;
      const now = Date.now();
      return now - updated < 24 * 60 * 60 * 1000;
    }).length;
    return { open, critical, high, resolvedToday };
  }, [alerts]);

  const handleAcknowledge = useCallback(async (alertId: string) => {
    const s = session;
    if (!s) return;
    setAcknowledging(alertId);
    try {
      await riskAlertService.acknowledgeAlert(alertId, s.role);
      setAlerts((prev) =>
        prev.map((a) => (a.id === alertId ? { ...a, status: 'acknowledged' as const } : a)),
      );
      setSelectedAlert((prev) =>
        prev && prev.id === alertId ? { ...prev, status: 'acknowledged' as const } : prev,
      );
    } catch {
      // handled silently
    } finally {
      setAcknowledging(null);
    }
  }, [session]);

  const handleResolve = useCallback(async (alertId: string) => {
    const s = session;
    if (!s) return;
    setResolving(alertId);
    try {
      await riskAlertService.resolveAlert(alertId, s.role);
      setAlerts((prev) =>
        prev.map((a) => (a.id === alertId ? { ...a, status: 'resolved' as const } : a)),
      );
      setSelectedAlert((prev) =>
        prev && prev.id === alertId ? { ...prev, status: 'resolved' as const } : prev,
      );
    } catch {
      // handled silently
    } finally {
      setResolving(null);
    }
  }, [session]);

  const getStudentDisplay = useCallback((alert: AlertWithId) => {
    const name = studentNames[alert.studentId];
    const showReal = alert.severity === 'critical' || alert.severity === 'high';
    if (showReal && name) return name;
    return 'Student ' + alert.studentId.slice(-4);
  }, [studentNames]);

  // ─── Loading ─────────────────────────────────────────────
  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={lightColors.primary} />
        <Text style={styles.loadingText}>Loading risk alerts…</Text>
      </View>
    );
  }

  // ─── Error ───────────────────────────────────────────────
  if (error) {
    return (
      <View style={styles.centerContainer}>
        <View style={[styles.errorBanner, { backgroundColor: lightColors.errorBackground, borderColor: lightColors.errorBorder }]}>
          <Text style={{ color: lightColors.errorText, fontSize: 13 }}>{error}</Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* Header */}
      <View>
        <Text style={styles.title}>Risk Alerts</Text>
        <Text style={styles.subtitle}>
          Monitor and manage student risk alerts. Critical alerts are shown first.
        </Text>
      </View>

      {/* Stats cards */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Open Alerts</Text>
          <Text style={styles.statValue}>{stats.open}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statLabel, { color: lightColors.errorText }]}>Critical</Text>
          <Text style={[styles.statValue, { color: lightColors.errorText }]}>{stats.critical}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statLabel, { color: lightColors.warningText }]}>High</Text>
          <Text style={[styles.statValue, { color: lightColors.warningText }]}>{stats.high}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statLabel, { color: lightColors.successText }]}>Resolved Today</Text>
          <Text style={[styles.statValue, { color: lightColors.successText }]}>{stats.resolvedToday}</Text>
        </View>
      </View>

      {/* Search + Filters */}
      <View style={styles.filtersCard}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by student name or alert text…"
          placeholderTextColor={lightColors.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        <View style={styles.filterRow}>
          <View style={styles.filterGroup}>
            <Text style={styles.filterLabel}>Status</Text>
            <View style={styles.filterOptions}>
              {(['all', 'open', 'acknowledged', 'resolved'] as StatusFilter[]).map((opt) => (
                <TouchableOpacity
                  key={opt}
                  onPress={() => setStatusFilter(opt)}
                  style={[styles.filterChip, statusFilter === opt && styles.filterChipActive]}
                >
                  <Text style={[styles.filterChipText, statusFilter === opt && styles.filterChipTextActive]}>
                    {opt === 'all' ? 'All' : opt.charAt(0).toUpperCase() + opt.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <View style={styles.filterGroup}>
            <Text style={styles.filterLabel}>Severity</Text>
            <View style={styles.filterOptions}>
              {(['all', 'critical', 'high', 'moderate', 'low'] as SeverityFilter[]).map((opt) => (
                <TouchableOpacity
                  key={opt}
                  onPress={() => setSeverityFilter(opt)}
                  style={[styles.filterChip, severityFilter === opt && styles.filterChipActive]}
                >
                  <Text style={[styles.filterChipText, severityFilter === opt && styles.filterChipTextActive]}>
                    {opt === 'all' ? 'All' : opt.charAt(0).toUpperCase() + opt.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </View>

      {/* Alert list */}
      {filteredAlerts.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyIcon}>{'\u26A0\uFE0F'}</Text>
          <Text style={styles.emptyTitle}>No alerts found</Text>
          <Text style={styles.emptyDescription}>
            {alerts.length === 0
              ? 'No risk alerts have been created yet. Alerts will appear here when students submit assessments with elevated risk scores.'
              : 'Try adjusting your filters or search query.'}
          </Text>
        </View>
      ) : (
        <View style={styles.alertList}>
          {/* Table header */}
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderCell, { flex: 1.2 }]}>Severity</Text>
            <Text style={[styles.tableHeaderCell, { flex: 1.5 }]}>Student</Text>
            <Text style={[styles.tableHeaderCell, { flex: 2 }]}>Alert</Text>
            <Text style={[styles.tableHeaderCell, { flex: 1 }]}>Status</Text>
            <Text style={[styles.tableHeaderCell, { flex: 1 }]}>Date</Text>
            <Text style={[styles.tableHeaderCell, { flex: 1, textAlign: 'right' }]}>Actions</Text>
          </View>

          {filteredAlerts.map((alert) => {
            const severity = alert.severity as AlertSeverity;
            return (
              <View key={alert.id} style={styles.alertRow}>
                <View style={{ flex: 1.2 }}>
                  <View style={[styles.severityPill, { backgroundColor: getSeverityBg(severity) }]}>
                    <Text style={[styles.severityPillText, { color: getSeverityColor(severity) }]}>
                      {severity.charAt(0).toUpperCase() + severity.slice(1)}
                    </Text>
                  </View>
                </View>
                <Text style={[styles.alertCell, { flex: 1.5, fontWeight: '500', color: lightColors.text }]}>
                  {getStudentDisplay(alert)}
                </Text>
                <View style={{ flex: 2 }}>
                  <Text style={styles.alertTitle} numberOfLines={1}>{alert.title}</Text>
                  <Text style={styles.alertDescription} numberOfLines={1}>{alert.description}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={[styles.statusPill, { backgroundColor: getStatusBg(alert.status) }]}>
                    <Text style={[styles.statusPillText, { color: getStatusColor(alert.status) }]}>
                      {alert.status.charAt(0).toUpperCase() + alert.status.slice(1)}
                    </Text>
                  </View>
                </View>
                <Text style={[styles.alertCell, { flex: 1, fontSize: 12 }]}>
                  {formatAlertDate(alert.createdAt)}
                </Text>
                <View style={{ flex: 1, alignItems: 'flex-end', gap: 4 }}>
                  <TouchableOpacity
                    onPress={() => setSelectedAlert(alert)}
                    style={styles.actionButton}
                  >
                    <Text style={styles.actionButtonText}>Details</Text>
                  </TouchableOpacity>
                  {alert.status === 'open' && (
                    <TouchableOpacity
                      onPress={() => handleAcknowledge(alert.id)}
                      style={styles.actionButton}
                      disabled={acknowledging === alert.id}
                    >
                      {acknowledging === alert.id ? (
                        <ActivityIndicator size="small" color={lightColors.primary} />
                      ) : (
                        <Text style={styles.actionButtonText}>Ack</Text>
                      )}
                    </TouchableOpacity>
                  )}
                  {(alert.status === 'open' || alert.status === 'acknowledged') && (
                    <TouchableOpacity
                      onPress={() => handleResolve(alert.id)}
                      style={[styles.actionButton, { backgroundColor: lightColors.primary }]}
                      disabled={resolving === alert.id}
                    >
                      {resolving === alert.id ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <Text style={[styles.actionButtonText, { color: '#FFFFFF' }]}>Resolve</Text>
                      )}
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* Detail Modal */}
      <Modal
        visible={!!selectedAlert}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedAlert(null)}
      >
        <View style={styles.modalOverlay}>
          <ScrollView style={styles.modalContent} contentContainerStyle={styles.modalContentInner}>
            {selectedAlert && (
              <>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>{selectedAlert.title}</Text>
                  <TouchableOpacity onPress={() => setSelectedAlert(null)}>
                    <Text style={styles.modalCloseText}>Close</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.modalDescription}>{selectedAlert.description}</Text>

                {/* Student info */}
                <View style={styles.modalSection}>
                  <View style={styles.modalInfoRow}>
                    <View>
                      <Text style={styles.modalInfoLabel}>Student</Text>
                      <Text style={styles.modalInfoValue}>
                        {(() => {
                          const showReal = selectedAlert.severity === 'critical' || selectedAlert.severity === 'high';
                          const sid = selectedAlert.studentId ?? '';
                          const name = studentNames[sid];
                          return showReal && name ? name : 'Student ' + sid.slice(-4);
                        })()}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={styles.modalInfoLabel}>Alert ID</Text>
                      <Text style={[styles.modalInfoValue, { fontSize: 11 }]}>{selectedAlert.id}</Text>
                    </View>
                  </View>
                </View>

                {/* Risk summary */}
                <View style={styles.modalSection}>
                  <View style={styles.riskSummaryRow}>
                    <View>
                      <Text style={styles.modalInfoLabel}>Risk Score</Text>
                      <Text style={styles.riskScoreValue}>{selectedAlert.overallRiskScore ?? 0}/100</Text>
                    </View>
                    <View>
                      <Text style={styles.modalInfoLabel}>Risk Level</Text>
                      <View style={[styles.severityPill, { backgroundColor: getSeverityBg(selectedAlert.severity as AlertSeverity), marginTop: 4 }]}>
                        <Text style={[styles.severityPillText, { color: getSeverityColor(selectedAlert.severity as AlertSeverity) }]}>
                          {selectedAlert.severity.charAt(0).toUpperCase() + selectedAlert.severity.slice(1)}
                        </Text>
                      </View>
                    </View>
                    <View>
                      <Text style={styles.modalInfoLabel}>Status</Text>
                      <View style={[styles.statusPill, { backgroundColor: getStatusBg(selectedAlert.status), marginTop: 4 }]}>
                        <Text style={[styles.statusPillText, { color: getStatusColor(selectedAlert.status) }]}>
                          {selectedAlert.status.charAt(0).toUpperCase() + selectedAlert.status.slice(1)}
                        </Text>
                      </View>
                    </View>
                    <View>
                      <Text style={styles.modalInfoLabel}>Created</Text>
                      <Text style={[styles.modalInfoValue, { fontSize: 12 }]}>{formatAlertDate(selectedAlert.createdAt)}</Text>
                    </View>
                  </View>
                </View>

                {/* Risk flags */}
                {selectedAlert.riskFlags && selectedAlert.riskFlags.length > 0 && (
                  <View style={styles.modalSection}>
                    <Text style={styles.modalInfoLabel}>Risk Flags</Text>
                    <View style={styles.flagsRow}>
                      {selectedAlert.riskFlags.map((flag, idx) => (
                        <View
                          key={idx}
                          style={[
                            styles.flagPill,
                            {
                              backgroundColor: flag.severity === 'critical' ? lightColors.criticalBackground
                                : flag.severity === 'high' ? lightColors.warningBackground
                                : lightColors.infoBackground,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.flagPillText,
                              {
                                color: flag.severity === 'critical' ? lightColors.criticalText
                                  : flag.severity === 'high' ? lightColors.warningText
                                  : lightColors.infoBadgeText,
                              },
                            ]}
                          >
                            {flag.label}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                {/* Timeline */}
                <View style={styles.modalSection}>
                  <Text style={styles.modalInfoLabel}>Timeline</Text>
                  <View style={styles.timeline}>
                    <View style={styles.timelineEvent}>
                      <Text style={styles.timelineIcon}>{'\uD83D\uDCDD'}</Text>
                      <View style={styles.timelineText}>
                        <Text style={styles.timelineLabel}>Assessment Submitted</Text>
                        <Text style={styles.timelineDate}>{formatAlertDate(selectedAlert.createdAt)}</Text>
                      </View>
                    </View>
                    <View style={styles.timelineEvent}>
                      <Text style={styles.timelineIcon}>{'\u26A0\uFE0F'}</Text>
                      <View style={styles.timelineText}>
                        <Text style={styles.timelineLabel}>Risk Alert Created</Text>
                        <Text style={styles.timelineDate}>{formatAlertDate(selectedAlert.createdAt)}</Text>
                      </View>
                    </View>
                    {selectedAlert.status === 'acknowledged' && (
                      <View style={styles.timelineEvent}>
                        <Text style={styles.timelineIcon}>{'\uD83D\uDC41'}</Text>
                        <View style={styles.timelineText}>
                          <Text style={styles.timelineLabel}>Facilitator Acknowledged</Text>
                          <Text style={styles.timelineDate}>{formatAlertDate(selectedAlert.updatedAt)}</Text>
                        </View>
                      </View>
                    )}
                    {selectedAlert.status === 'resolved' && (
                      <View style={styles.timelineEvent}>
                        <Text style={styles.timelineIcon}>{'\u2705'}</Text>
                        <View style={styles.timelineText}>
                          <Text style={styles.timelineLabel}>Risk Resolved</Text>
                          <Text style={styles.timelineDate}>{formatAlertDate(selectedAlert.updatedAt)}</Text>
                        </View>
                      </View>
                    )}
                  </View>
                </View>

                {/* Actions */}
                <View style={styles.modalActions}>
                  {selectedAlert.status === 'open' && (
                    <TouchableOpacity
                      onPress={() => handleAcknowledge(selectedAlert.id)}
                      style={[styles.modalActionButton, { borderWidth: 1.5, borderColor: lightColors.primary }]}
                    >
                      <Text style={[styles.modalActionText, { color: lightColors.primary }]}>Acknowledge</Text>
                    </TouchableOpacity>
                  )}
                  {(selectedAlert.status === 'open' || selectedAlert.status === 'acknowledged') && (
                    <TouchableOpacity
                      onPress={() => handleResolve(selectedAlert.id)}
                      style={[styles.modalActionButton, { backgroundColor: lightColors.primary }]}
                    >
                      <Text style={[styles.modalActionText, { color: '#FFFFFF' }]}>Resolve</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    onPress={() => setSelectedAlert(null)}
                    style={[styles.modalActionButton, { borderWidth: 1.5, borderColor: lightColors.border }]}
                  >
                    <Text style={[styles.modalActionText, { color: lightColors.textSecondary }]}>Close</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </ScrollView>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: lightColors.background,
  },
  contentContainer: {
    padding: 16,
    gap: 16,
    paddingBottom: 40,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: lightColors.background,
    padding: 24,
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: lightColors.textSecondary,
    marginTop: 8,
  },
  errorBanner: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: lightColors.text,
  },
  subtitle: {
    fontSize: 14,
    color: lightColors.textSecondary,
    marginTop: 4,
  },
  // Stats
  statsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  statCard: {
    flex: 1,
    backgroundColor: lightColors.surface,
    borderWidth: 1,
    borderColor: lightColors.border,
    borderRadius: 10,
    padding: 10,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: lightColors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  statValue: {
    fontSize: 22,
    fontWeight: '700',
    color: lightColors.text,
    marginTop: 2,
  },
  // Filters
  filtersCard: {
    backgroundColor: lightColors.surface,
    borderWidth: 1,
    borderColor: lightColors.border,
    borderRadius: 12,
    padding: 12,
    gap: 12,
  },
  searchInput: {
    backgroundColor: lightColors.background,
    borderWidth: 1,
    borderColor: lightColors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: lightColors.text,
  },
  filterRow: {
    gap: 10,
  },
  filterGroup: {},
  filterLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: lightColors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 6,
  },
  filterOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  filterChip: {
    borderWidth: 1,
    borderColor: lightColors.border,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  filterChipActive: {
    borderColor: lightColors.primary,
    backgroundColor: lightColors.errorBackground,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '500',
    color: lightColors.textSecondary,
  },
  filterChipTextActive: {
    color: lightColors.primaryDark,
    fontWeight: '600',
  },
  // Empty
  emptyCard: {
    borderWidth: 2,
    borderColor: lightColors.border,
    borderStyle: 'dashed',
    borderRadius: 12,
    backgroundColor: lightColors.surface,
    padding: 32,
    alignItems: 'center',
  },
  emptyIcon: {
    fontSize: 32,
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: lightColors.text,
    marginBottom: 4,
  },
  emptyDescription: {
    fontSize: 13,
    color: lightColors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
  // Alert list
  alertList: {
    backgroundColor: lightColors.surface,
    borderWidth: 1,
    borderColor: lightColors.border,
    borderRadius: 12,
    overflow: 'hidden',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: lightColors.neutralBackground,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: lightColors.border,
  },
  tableHeaderCell: {
    fontSize: 10,
    fontWeight: '600',
    color: lightColors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  alertRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: lightColors.border,
  },
  alertCell: {
    fontSize: 13,
    color: lightColors.textSecondary,
  },
  alertTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: lightColors.text,
  },
  alertDescription: {
    fontSize: 11,
    color: lightColors.textMuted,
    marginTop: 1,
  },
  severityPill: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  severityPillText: {
    fontSize: 10,
    fontWeight: '600',
  },
  statusPill: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: '600',
  },
  actionButton: {
    borderWidth: 1,
    borderColor: lightColors.border,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  actionButtonText: {
    fontSize: 10,
    fontWeight: '600',
    color: lightColors.primary,
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    padding: 16,
  },
  modalContent: {
    backgroundColor: lightColors.surface,
    borderRadius: 16,
    maxHeight: '90%',
  },
  modalContentInner: {
    padding: 20,
    gap: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: lightColors.text,
    flex: 1,
    marginRight: 12,
  },
  modalCloseText: {
    fontSize: 14,
    fontWeight: '600',
    color: lightColors.primary,
  },
  modalDescription: {
    fontSize: 14,
    color: lightColors.textSecondary,
    lineHeight: 20,
  },
  modalSection: {
    gap: 8,
  },
  modalInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  modalInfoLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: lightColors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  modalInfoValue: {
    fontSize: 14,
    fontWeight: '500',
    color: lightColors.text,
    marginTop: 2,
  },
  riskSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 12,
  },
  riskScoreValue: {
    fontSize: 20,
    fontWeight: '700',
    color: lightColors.text,
    marginTop: 2,
  },
  flagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  flagPill: {
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  flagPillText: {
    fontSize: 11,
    fontWeight: '600',
  },
  timeline: {
    gap: 10,
  },
  timelineEvent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  timelineIcon: {
    fontSize: 16,
    marginTop: 1,
  },
  timelineText: {
    flex: 1,
  },
  timelineLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: lightColors.text,
  },
  timelineDate: {
    fontSize: 11,
    color: lightColors.textMuted,
    marginTop: 1,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: lightColors.border,
  },
  modalActionButton: {
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
  },
  modalActionText: {
    fontSize: 13,
    fontWeight: '600',
  },
});