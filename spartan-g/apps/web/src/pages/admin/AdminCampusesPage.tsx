import { useCallback, useEffect, useMemo, useState } from 'react';
import { campusRepository } from '@spartan-g/shared-services';
import { auditService } from '@spartan-g/shared-services';
import {
  AUDIT_ACTIONS,
  ALL_CAMPUSES,
  CAMPUS_LABELS,
  CAMPUS_LOCATIONS,
  type CampusDocument,
} from '@spartan-g/shared-types';
import { useAuth } from '../../hooks/useAuth';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { Spinner } from '../../components/ui/Spinner';

interface CampusRow {
  id: string;
  key: string;
  label: string;
  location: string;
  isActive: boolean;
  sortOrder: number;
  persisted: boolean;
}

const DEFAULT_ROWS: CampusRow[] = ALL_CAMPUSES.map((key, index) => ({
  id: `default-${key}`,
  key,
  label: CAMPUS_LABELS[key],
  location: CAMPUS_LOCATIONS[key],
  isActive: true,
  sortOrder: index,
  persisted: false,
}));

const EMPTY_FORM = {
  key: '',
  label: '',
  location: '',
  isActive: true,
};

function toRows(campuses: (CampusDocument & { id: string })[]): CampusRow[] {
  const persisted = campuses.map((campus) => ({
    id: campus.id,
    key: campus.key,
    label: campus.label,
    location: campus.location,
    isActive: campus.isActive,
    sortOrder: campus.sortOrder,
    persisted: true,
  }));
  const keys = new Set(persisted.map((campus) => campus.key));
  return [
    ...persisted,
    ...DEFAULT_ROWS.filter((campus) => !keys.has(campus.key)),
  ].sort((a, b) => a.label.localeCompare(b.label));
}

export function AdminCampusesPage() {
  const { user } = useAuth();
  const [campuses, setCampuses] = useState<CampusRow[]>(DEFAULT_ROWS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CampusRow | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setCampuses(toRows(await campusRepository.getAllCampuses()));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const missingDefaults = useMemo(
    () => campuses.filter((campus) => !campus.persisted && ALL_CAMPUSES.includes(campus.key as (typeof ALL_CAMPUSES)[number])),
    [campuses],
  );

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setModalOpen(true);
  }

  function openEdit(campus: CampusRow) {
    setEditing(campus);
    setForm({
      key: campus.key,
      label: campus.label,
      location: campus.location,
      isActive: campus.isActive,
    });
    setFormError(null);
    setModalOpen(true);
  }

  async function handleSave() {
    if (!user) return;
    const key = form.key.trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_');
    const label = form.label.trim();
    const location = form.location.trim();
    if (!key || !label || !location) {
      setFormError('Campus key, name, and location are required.');
      return;
    }
    if (!editing && campuses.some((campus) => campus.key === key)) {
      setFormError('That campus key already exists.');
      return;
    }

    setBusy(true);
    setFormError(null);
    try {
      const data = {
        key,
        label,
        location,
        sortOrder: editing?.sortOrder ?? campuses.length,
          isActive: true,
        createdBy: user.uid,
      } as CampusDocument;
      if (editing?.persisted) {
        await campusRepository.update(editing.id, data);
        await auditService.record({
          actorId: user.uid,
          actorEmail: user.email,
          action: AUDIT_ACTIONS.SUPERADMIN_UPDATED_CAMPUS,
          resource: 'campuses',
          resourceId: editing.id,
          metadata: { campusKey: key, changedFields: Object.keys(data) },
        });
      } else {
        await campusRepository.create(key, data);
        await auditService.record({
          actorId: user.uid,
          actorEmail: user.email,
          action: AUDIT_ACTIONS.SUPERADMIN_CREATED_CAMPUS,
          resource: 'campuses',
          resourceId: key,
          metadata: { campusKey: key, changedFields: Object.keys(data) },
        });
      }
      setModalOpen(false);
      await load();
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function syncDefaults() {
    if (!user) return;
    setSyncing(true);
    setError(null);
    try {
      for (const campus of missingDefaults) {
          await campusRepository.create(campus.key, {
          key: campus.key,
          label: campus.label,
          location: campus.location,
          isActive: true,
          sortOrder: campus.sortOrder,
          createdBy: user.uid,
        } as CampusDocument);
          await auditService.record({
            actorId: user.uid,
            actorEmail: user.email,
            action: AUDIT_ACTIONS.SUPERADMIN_CREATED_CAMPUS,
            resource: 'campuses',
            resourceId: campus.key,
            metadata: { campusKey: campus.key, source: 'default-sync' },
          });
      }
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSyncing(false);
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center py-12"><Spinner label="Loading campuses…" /></div>;
  }

  if (error && campuses.length === 0) {
    return <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">Failed to load campuses: {error}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">Campuses</h1>
          <p className="mt-1 text-sm text-gray-500">Manage the campus directory used by registration, profiles, and facilitator filtering.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {missingDefaults.length > 0 && <Button variant="outline" onClick={syncDefaults} isLoading={syncing}>Sync default campuses</Button>}
          <Button onClick={openCreate}>+ Add campus</Button>
        </div>
      </div>

      {error && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">{error}</div>}

      {campuses.length === 0 ? (
        <EmptyState title="No campuses yet" description="Add a campus to make it available in registration and profiles." action={<Button onClick={openCreate}>Add campus</Button>} />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50"><tr>{['Name', 'Key', 'Location', 'Status', 'Actions'].map((heading) => <th key={heading} className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">{heading}</th>)}</tr></thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {campuses.map((campus) => (
                  <tr key={campus.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">{campus.label}</td>
                    <td className="px-6 py-4 font-mono text-xs text-gray-600">{campus.key}</td>
                    <td className="px-6 py-4 text-sm text-gray-700">{campus.location}</td>
                    <td className="px-6 py-4">{campus.isActive ? <Badge variant="success">Active</Badge> : <Badge variant="neutral">Inactive</Badge>}</td>
                    <td className="px-6 py-4 text-right"><Button variant="outline" onClick={() => openEdit(campus)}>Edit</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Modal open={modalOpen} onClose={() => (busy ? null : setModalOpen(false))} title={editing ? 'Edit campus' : 'Add campus'} description="Changes are saved to the Firestore campuses collection." size="md">
        {formError && <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">{formError}</div>}
        <div className="space-y-4">
          <Input label="Campus key" value={form.key} onChange={(event) => setForm({ ...form, key: event.target.value })} disabled={busy || Boolean(editing?.persisted)} placeholder="e.g. batangas_city" />
          <Input label="Campus name" value={form.label} onChange={(event) => setForm({ ...form, label: event.target.value })} disabled={busy} placeholder="e.g. Batangas City Campus" />
          <Input label="Location" value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} disabled={busy} placeholder="e.g. Batangas City" />
        </div>
        <div className="mt-5 flex justify-end gap-2"><Button variant="outline" onClick={() => setModalOpen(false)} disabled={busy}>Cancel</Button><Button onClick={handleSave} isLoading={busy}>Save campus</Button></div>
      </Modal>
    </div>
  );
}
