import { useCallback, useEffect, useState } from "react";
import type { Role } from "@spartan-g/shared-types";
import { useAuth } from "../../hooks/useAuth";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Select } from "../ui/Select";
import { Spinner } from "../ui/Spinner";
import { Textarea } from "../ui/Textarea";
import {
  MAX_OVERRIDE_ATTEMPTS,
  MAX_REASON_LENGTH,
  MIN_OVERRIDE_ATTEMPTS,
  getOverrideContext,
  listAssessmentOptions,
  removeAttemptOverride,
  setAttemptOverride,
  type AssessmentOption,
  type OverrideContext,
} from "../../lib/assessmentOverrides";

interface AssessmentOverrideDialogProps {
  open: boolean;
  onClose: () => void;
  student: { id: string; name: string };
  actorRole: Role;
  /** Called after an override was saved or removed, so the caller can refresh. */
  onChanged?: () => void;
}

function Stat({ label, value, tone = "" }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-alt)] px-3 py-2">
      <dt className="text-xs text-[var(--color-text-muted)]">{label}</dt>
      <dd className={`mt-0.5 text-lg font-semibold text-[var(--color-text)] ${tone}`}>{value}</dd>
    </div>
  );
}

/**
 * Super-admin dialog to raise or lower a student's attempt limit for one
 * assessment (the same override the mobile app reads), or to remove it.
 */
export function AssessmentOverrideDialog({ open, onClose, student, actorRole, onChanged }: AssessmentOverrideDialogProps) {
  const { user: actor } = useAuth();
  const [assessments, setAssessments] = useState<AssessmentOption[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loadingList, setLoadingList] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const [context, setContext] = useState<OverrideContext | null>(null);
  const [loadingContext, setLoadingContext] = useState(false);

  const [attempts, setAttempts] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Load the assessment list each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingList(true);
    setListError(null);
    setError(null);
    setSuccess(null);
    setReason("");
    listAssessmentOptions()
      .then((options) => {
        if (cancelled) return;
        setAssessments(options);
        setSelectedId(options[0]?.id ?? "");
      })
      .catch((err) => !cancelled && setListError(err instanceof Error ? err.message : "Failed to load assessments."))
      .finally(() => !cancelled && setLoadingList(false));
    return () => {
      cancelled = true;
    };
  }, [open]);

  const loadContext = useCallback(
    async (assessmentId: string, keepForm = false) => {
      const assessment = assessments.find((a) => a.id === assessmentId);
      if (!assessment) return;
      setLoadingContext(true);
      setError(null);
      try {
        const ctx = await getOverrideContext(assessment, student.id);
        setContext(ctx);
        if (!keepForm) {
          setAttempts(String(ctx.override?.maxAttemptsOverride ?? Math.min(MAX_OVERRIDE_ATTEMPTS, Math.max(ctx.attemptsUsed + 1, ctx.defaultMaxAttempts))));
          setReason("");
        }
      } catch (err) {
        setContext(null);
        setError(err instanceof Error ? err.message : "Failed to load attempt details.");
      } finally {
        setLoadingContext(false);
      }
    },
    [assessments, student.id],
  );

  useEffect(() => {
    if (open && selectedId) {
      setSuccess(null);
      void loadContext(selectedId);
    }
  }, [open, selectedId, loadContext]);

  const selected = assessments.find((a) => a.id === selectedId);
  const hasOverride = !!context?.override;

  const handleSave = async () => {
    if (!selected || !context || !actor) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const value = Number(attempts);
      const result = await setAttemptOverride({
        actorRole,
        actorUid: actor.uid,
        actorEmail: actor.email,
        studentId: student.id,
        assessmentId: selected.id,
        maxAttempts: value,
        attemptsUsed: context.attemptsUsed,
        defaultMaxAttempts: context.defaultMaxAttempts,
        reason,
      });
      setSuccess(
        (result.changed ? `Saved. ${student.name} can now make up to ${value} attempt${value === 1 ? "" : "s"}.` : "No changes to save.") +
          (result.auditFailed ? " The change was saved, but its audit entry could not be recorded." : ""),
      );
      await loadContext(selected.id);
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save the override.");
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    if (!selected || !context || !actor) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await removeAttemptOverride({
        actorRole,
        actorUid: actor.uid,
        actorEmail: actor.email,
        studentId: student.id,
        assessmentId: selected.id,
        defaultMaxAttempts: context.defaultMaxAttempts,
        reason,
      });
      setSuccess(
        `Override removed. The default limit of ${selected.defaultMaxAttempts} applies again.` +
          (result.auditFailed ? " The change was saved, but its audit entry could not be recorded." : ""),
      );
      await loadContext(selected.id);
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove the override.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={saving ? () => undefined : onClose}
      title="Override attempt limit"
      description={`Set how many attempts ${student.name} may make on an assessment.`}
    >
      <div className="space-y-4">
        {loadingList ? (
          <div className="flex justify-center py-6">
            <Spinner label="Loading assessments…" />
          </div>
        ) : listError ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{listError}</p>
        ) : assessments.length === 0 ? (
          <p className="text-sm text-[var(--color-text-secondary)]">There are no published assessments to override.</p>
        ) : (
          <>
            <Select label="Assessment" value={selectedId} onChange={(e) => setSelectedId(e.target.value)} disabled={saving}>
              {assessments.map((a) => (
                <option key={a.id} value={a.id}>{a.title}</option>
              ))}
            </Select>

            {loadingContext ? (
              <div className="flex justify-center py-4">
                <Spinner label="Loading attempts…" />
              </div>
            ) : context ? (
              <>
                <dl className="grid grid-cols-3 gap-2">
                  <Stat label="Attempts used" value={context.attemptsUsed} />
                  <Stat label="Default limit" value={context.defaultMaxAttempts} />
                  <Stat label={hasOverride ? "Current limit (override)" : "Current limit"} value={context.effectiveMax} tone={hasOverride ? "text-[var(--color-warning)]" : ""} />
                </dl>
                {context.override?.reason && (
                  <p className="text-xs text-[var(--color-text-secondary)]">
                    Current reason: <span className="text-[var(--color-text)]">{context.override.reason}</span>
                  </p>
                )}

                <Input
                  label="New allowance (total attempts)"
                  type="number"
                  inputMode="numeric"
                  min={Math.max(MIN_OVERRIDE_ATTEMPTS, context.attemptsUsed)}
                  max={MAX_OVERRIDE_ATTEMPTS}
                  step={1}
                  value={attempts}
                  onChange={(e) => setAttempts(e.target.value)}
                  disabled={saving}
                />
                <p className="-mt-2 text-xs text-[var(--color-text-muted)]">
                  Between {Math.max(MIN_OVERRIDE_ATTEMPTS, context.attemptsUsed)} and {MAX_OVERRIDE_ATTEMPTS}. This replaces the default limit for this student only.
                </p>
                <Textarea
                  label="Reason"
                  rows={3}
                  maxLength={MAX_REASON_LENGTH}
                  placeholder="Why is this override being granted?"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  disabled={saving}
                />
              </>
            ) : null}
          </>
        )}

        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>
        )}
        {success && (
          <p className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700" role="status">{success}</p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
          <div>
            {hasOverride && (
              <Button variant="outline" onClick={handleRemove} disabled={saving || loadingContext}>
                Remove override
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>
              Close
            </Button>
            <Button onClick={handleSave} isLoading={saving} disabled={!context || loadingContext}>
              Save override
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
