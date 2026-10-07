import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { saveStudentProfile } from "../../lib/adminStudentProfile";
import { userRepository, profileRepository, adminService } from "@spartan-g/shared-services";
import {
  CAMPUS_LABELS,
  ROLE_LABELS,
  getErrorMessage,
  type Campus,
  type Gender,
  type ProfileDocument,
  type UserDocument,
} from "@spartan-g/shared-types";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card, CardBody, CardHeader } from "../../components/ui/Card";
import { EmptyState } from "../../components/ui/EmptyState";
import { Input } from "../../components/ui/Input";
import { Modal } from "../../components/ui/Modal";
import { Spinner } from "../../components/ui/Spinner";
import {
  ProfileSettingsForm,
  type ProfileFormValue,
} from "../../components/profile/ProfileSettingsForm";

const EMPTY_PROFILE: ProfileFormValue = {
  campus: "",
  bio: "",
  phone: "",
  institution: "",
  pronouns: "",
  gender: "",
};

function toDate(value: unknown): string {
  const d = (value as { toDate?: () => Date } | null)?.toDate?.();
  return d ? d.toLocaleDateString() : "—";
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-1 py-3 sm:grid-cols-3 sm:gap-4">
      <dt className="text-sm font-medium text-gray-500">{label}</dt>
      <dd className="text-sm text-gray-900 sm:col-span-2">{value}</dd>
    </div>
  );
}

/**
 * Super Admin — User Details.
 *
 * View a user's account + profile (the SAME users/profiles documents their
 * portal reads), edit permitted profile fields, and change their password
 * through the secure Cloud Function backend.
 */
export function AdminUserDetailPage() {
  const { uid } = useParams<{ uid: string }>();
  const { user: actor } = useAuth();

  const [target, setTarget] = useState<(UserDocument & { id: string }) | null>(null);
  const [profile, setProfile] = useState<ProfileFormValue>(EMPTY_PROFILE);
  const [initial, setInitial] = useState<ProfileFormValue>(EMPTY_PROFILE);
  const [initialName, setInitialName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [pwOpen, setPwOpen] = useState(false);
  const [pwNew, setPwNew] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSuccess, setPwSuccess] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);

  const load = useCallback(async () => {
    if (!uid) return;
    setLoading(true);
    setLoadError(null);
    try {
      const userDoc = await userRepository.getById(uid);
      if (!userDoc) {
        setLoadError("User not found.");
        setTarget(null);
        return;
      }
      const prof = await profileRepository.getById(uid);
      const next: ProfileFormValue = {
        campus: ((prof?.campus as Campus | undefined) ?? userDoc.campus ?? "") as Campus | "",
        bio: prof?.bio || "",
        phone: prof?.phone || "",
        institution: prof?.institution || "",
        pronouns: prof?.pronouns || "",
        gender: (prof?.gender || "") as Gender | "",
      };
      setTarget(userDoc);
      setProfile(next);
      setInitial(next);
      setDisplayName(userDoc.displayName || "");
      setInitialName(userDoc.displayName || "");
    } catch (err) {
      setLoadError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [uid]);

  useEffect(() => {
    void load();
  }, [load]);

  const isSelf = !!actor && actor.uid === uid;

  const handleSave = async () => {
    if (!actor || !target) return;
    if (!profile.campus) {
      setSaveError("Please select a campus.");
      return;
    }

    const changedFields: string[] = [];
    if (displayName.trim() !== initialName) changedFields.push("displayName");
    (Object.keys(profile) as (keyof ProfileFormValue)[]).forEach((k) => {
      if (profile[k] !== initial[k]) changedFields.push(k);
    });

    if (changedFields.length === 0) {
      setEditing(false);
      setSaveSuccess(true);
      setSaveError(null);
      return;
    }

    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      if (displayName.trim() !== initialName) {
        await adminService.updateAccountDisplayName({
          actorRole: actor.role,
          actorUid: actor.uid,
          actorEmail: actor.email,
          targetUid: target.id,
          targetRole: target.role,
          displayName: displayName.trim(),
        });
      }

      if (changedFields.some((f) => f !== "displayName") && target.role === "student") {
        // Student profiles are written by a Cloud Function that validates the
        // caller, the target role and every value server-side.
        await saveStudentProfile({
          actorRole: actor.role,
          targetUid: target.id,
          campus: profile.campus,
          bio: profile.bio,
          phone: profile.phone,
          institution: profile.institution,
          pronouns: profile.pronouns,
          gender: profile.gender,
        });
      } else if (changedFields.some((f) => f !== "displayName")) {
        await adminService.saveUserProfile({
          actorRole: actor.role,
          actorUid: actor.uid,
          actorEmail: actor.email,
          targetUid: target.id,
          targetRole: target.role,
          campus: profile.campus as Campus,
          profileFields: {
            bio: profile.bio,
            phone: profile.phone,
            institution: profile.institution,
            pronouns: profile.pronouns,
            gender: profile.gender || undefined,
          } as Partial<ProfileDocument>,
          changedFields,
        });
      }

      setEditing(false);
      setSaveSuccess(true);
      await load();
    } catch (err) {
      setSaveError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setProfile(initial);
    setDisplayName(initialName);
    setEditing(false);
    setSaveError(null);
  };

  const handlePasswordChange = async () => {
    if (!actor || !target) return;
    setPwError(null);
    setPwSuccess(false);

    if (pwNew.length < 8) {
      setPwError("Password must be at least 8 characters.");
      return;
    }
    if (pwNew !== pwConfirm) {
      setPwError("Passwords do not match.");
      return;
    }

    setPwSaving(true);
    try {
      await adminService.changeUserPassword({
        actorRole: actor.role,
        actorUid: actor.uid,
        actorEmail: actor.email,
        targetUid: target.id,
        newPassword: pwNew,
      });
      setPwSuccess(true);
      setPwNew("");
      setPwConfirm("");
    } catch (err) {
      setPwError(getErrorMessage(err));
    } finally {
      setPwSaving(false);
    }
  };

  const closePasswordModal = () => {
    if (pwSaving) return;
    setPwOpen(false);
    setPwNew("");
    setPwConfirm("");
    setPwError(null);
    setPwSuccess(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner label="Loading user…" />
      </div>
    );
  }

  if (loadError || !target) {
    return (
      <div className="space-y-4">
        <Link to="/admin/users" className="text-sm text-indigo-600 hover:underline">
          ← Back to Users
        </Link>
        <EmptyState
          title={loadError === "User not found." ? "User not found" : "Unable to load user"}
          description={loadError ?? "This account does not exist."}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link to="/admin/users" className="text-sm text-indigo-600 hover:underline">
            ← Back to Users
          </Link>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
            User Profile
          </h1>
        </div>
        {!editing && (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setSaveSuccess(false);
                setSaveError(null);
                setEditing(true);
              }}
              disabled={isSelf}
            >
              Edit Profile
            </Button>
            <Button variant="secondary" onClick={() => setPwOpen(true)} disabled={isSelf}>
              Change Password
            </Button>
          </div>
        )}
      </div>

      {isSelf && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
          This is your own account — use the Profile page in the sidebar to edit it.
        </div>
      )}

      {saveSuccess && !editing && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700" role="status">
          Changes saved successfully!
        </div>
      )}

      {/* Account summary */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-indigo-100 text-xl font-semibold text-indigo-700">
              {(target.displayName || target.email || "?").charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate text-lg font-semibold text-gray-900">
                {target.displayName || "—"}
              </p>
              <p className="truncate text-sm text-gray-500">{target.email}</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <Badge variant={target.role === "super_admin" ? "default" : target.role === "facilitator" ? "warning" : "info"}>
                  {ROLE_LABELS[target.role] ?? target.role}
                </Badge>
                {target.isActive ? (
                  <Badge variant="success">Active</Badge>
                ) : (
                  <Badge variant="danger">Inactive</Badge>
                )}
              </div>
            </div>
          </div>
        </CardHeader>
        <CardBody>
          {!editing ? (
            <dl className="divide-y divide-gray-100">
              <InfoRow label="Full Name" value={target.displayName || "—"} />
              <InfoRow label="Email" value={target.email} />
              <InfoRow label="Role" value={ROLE_LABELS[target.role] ?? target.role} />
              <InfoRow
                label="Campus"
                value={target.campus ? CAMPUS_LABELS[target.campus] ?? target.campus : "—"}
              />
              <InfoRow label="Status" value={target.isActive ? "Active" : "Inactive"} />
              <InfoRow
                label="Pronouns"
                value={profile.pronouns || "—"}
              />
              <InfoRow label="Gender" value={profile.gender || "—"} />
              <InfoRow label="Phone" value={profile.phone || "—"} />
              <InfoRow label="Institution" value={profile.institution || "—"} />
              <InfoRow label="Bio" value={profile.bio || "—"} />
              <InfoRow label="Member Since" value={toDate(target.createdAt)} />
              <InfoRow
                label="User ID"
                value={<span className="break-all font-mono text-xs">{target.id}</span>}
              />
            </dl>
          ) : (
            <div className="space-y-6">
              <Input
                label="Full Name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Full name"
              />
              <ProfileSettingsForm
                value={profile}
                onChange={setProfile}
                onSave={handleSave}
                isSaving={saving}
                error={saveError}
                success={false}
                actions={
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={handleCancelEdit} disabled={saving}>
                      Cancel
                    </Button>
                    <Button onClick={handleSave} isLoading={saving}>
                      Save changes
                    </Button>
                  </div>
                }
              />
            </div>
          )}
        </CardBody>
      </Card>

      {/* Change password — handled by the adminSetUserPassword Cloud Function */}
      <Modal
        open={pwOpen}
        onClose={closePasswordModal}
        title="Change Password"
        description={
          target
            ? `Set a new password for ${target.displayName || target.email}.`
            : undefined
        }
        size="md"
      >
        {pwError && (
          <div
            className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
            role="alert"
          >
            {pwError}
          </div>
        )}
        {pwSuccess && (
          <div
            className="mb-3 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700"
            role="status"
          >
            Password updated successfully. The user can now sign in with the new password.
          </div>
        )}

        <div className="space-y-4">
          <Input
            label="New password"
            type="password"
            showPasswordToggle
            placeholder="At least 8 characters"
            value={pwNew}
            onChange={(e) => setPwNew(e.target.value)}
            disabled={pwSaving}
          />
          <Input
            label="Confirm new password"
            type="password"
            showPasswordToggle
            placeholder="Repeat the new password"
            value={pwConfirm}
            onChange={(e) => setPwConfirm(e.target.value)}
            disabled={pwSaving}
          />
          <p className="text-xs text-gray-500">
            Passwords are set securely on the server via Firebase Admin — the browser never
            receives privileged credentials, and the change is recorded in the audit log.
          </p>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={closePasswordModal} disabled={pwSaving}>
            {pwSuccess ? "Close" : "Cancel"}
          </Button>
          {!pwSuccess && (
            <Button onClick={handlePasswordChange} isLoading={pwSaving}>
              Change Password
            </Button>
          )}
        </div>
      </Modal>
    </div>
  );
}
