import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TextInput,
  Alert,
} from 'react-native';
import { useAuthStore, userService } from '@spartan-g/shared-services';
import type { UserDocument, ProfileDocument } from '@spartan-g/shared-types';
import { lightColors, palette } from '@spartan-g/shared-ui';
import { Feather } from '@expo/vector-icons';

export function FacilitatorProfileScreen() {
  const session = useAuthStore((s) => s.session);
  const signOut = useAuthStore((s) => s.signOut);

  const [user, setUser] = useState<UserDocument | null>(null);
  const [profile, setProfile] = useState<ProfileDocument | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Editable fields from ProfileDocument
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [institution, setInstitution] = useState('');
  const [bio, setBio] = useState('');

  const load = useCallback(async () => {
    if (!session) return;
    try {
      setIsLoading(true);
      setError(null);

      const [userDoc, profileDoc] = await Promise.all([
        userService.getUser(session.uid),
        userService.getProfile(session.uid),
      ]);

      if (userDoc) {
        setUser(userDoc);
        setDisplayName(userDoc.displayName || '');
      }
      if (profileDoc) {
        setProfile(profileDoc);
        setPhone(profileDoc.phone || '');
        setInstitution(profileDoc.institution || '');
        setBio(profileDoc.bio || '');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load profile');
    } finally {
      setIsLoading(false);
    }
  }, [session]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = useCallback(async () => {
    if (!session) return;

    try {
      setIsSaving(true);

      const profileData: Partial<ProfileDocument> = {
        phone: phone || undefined,
        institution: institution || undefined,
        bio: bio || undefined,
      };

      await userService.updateProfile(session.role, session.uid, profileData, session.uid);

      Alert.alert('Success', 'Your profile has been updated.', [
        { text: 'OK', onPress: load },
      ]);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to save profile');
    } finally {
      setIsSaving(false);
    }
  }, [session, phone, institution, bio, load]);

  const handleSignOut = useCallback(async () => {
    await signOut();
  }, [signOut]);

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={lightColors.primary} />
        <Text style={styles.loadingText}>Loading profile...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centerContainer}>
        <View style={styles.errorIcon}>
          <Text style={styles.errorIconText}>!</Text>
        </View>
        <Text style={styles.errorTitle}>Error</Text>
        <Text style={styles.errorMessage}>{error}</Text>
        <TouchableOpacity onPress={load} style={styles.retryButton}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* Header */}
      <View style={styles.headerRow}>
        <Feather name="user" size={22} color={lightColors.primary} />
        <Text style={styles.headerTitle}>My Profile</Text>
      </View>

      {/* Avatar placeholder */}
      <View style={styles.avatarContainer}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {displayName.charAt(0).toUpperCase()}
          </Text>
        </View>
      </View>

      {/* Read-only fields */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account Information</Text>
        <View style={styles.card}>
          <FieldRow label="Email" value={user?.email || ''} icon="mail" />
          <FieldRow label="Role" value={user?.role || 'facilitator'} icon="shield" />
          <FieldRow label="Account ID" value={session?.uid || ''} icon="hash" />
        </View>
      </View>

      {/* Editable fields */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Profile Details</Text>
        <View style={styles.card}>
          <EditField label="Display Name" value={displayName} onChange={setDisplayName} icon="user" />
          <EditField label="Phone" value={phone} onChange={setPhone} icon="phone" />
          <EditField label="Institution" value={institution} onChange={setInstitution} icon="briefcase" />
          <EditField
            label="Bio"
            value={bio}
            onChange={setBio}
            icon="file-text"
            multiline
            numberOfLines={3}
          />
        </View>
      </View>

      {/* Save button */}
      <TouchableOpacity
        onPress={handleSave}
        style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
        disabled={isSaving}
        activeOpacity={0.8}
      >
        {isSaving ? (
          <ActivityIndicator size="small" color="#FFFFFF" />
        ) : (
          <>
            <Feather name="check-circle" size={20} color="#FFFFFF" />
            <Text style={styles.saveButtonText}>Save Changes</Text>
          </>
        )}
      </TouchableOpacity>

      {/* Sign out button */}
      <TouchableOpacity
        onPress={handleSignOut}
        style={styles.signOutButton}
        activeOpacity={0.8}
      >
        <Feather name="log-out" size={20} color={palette.spartanRed} />
        <Text style={styles.signOutButtonText}>Sign Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function FieldRow({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <View style={styles.fieldRow}>
      <View style={styles.fieldIconContainer}>
        <Feather name={icon as any} size={16} color={lightColors.textMuted} />
      </View>
      <View style={styles.fieldContent}>
        <Text style={styles.fieldLabel}>{label}</Text>
        <Text style={styles.fieldValue}>{value || '—'}</Text>
      </View>
    </View>
  );
}

function EditField({
  label,
  value,
  onChange,
  icon,
  multiline,
  numberOfLines,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  icon: string;
  multiline?: boolean;
  numberOfLines?: number;
}) {
  return (
    <View style={styles.fieldRow}>
      <View style={styles.fieldIconContainer}>
        <Feather name={icon as any} size={16} color={lightColors.textMuted} />
      </View>
      <View style={styles.fieldContent}>
        <Text style={styles.fieldLabel}>{label}</Text>
        <TextInput
          style={[styles.fieldInput, multiline && styles.fieldInputMultiline]}
          value={value}
          onChangeText={onChange}
          placeholder={`Enter ${label.toLowerCase()}`}
          placeholderTextColor={lightColors.textMuted}
          multiline={multiline}
          numberOfLines={numberOfLines}
          textAlignVertical={multiline ? 'top' : 'center'}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: lightColors.background,
  },
  contentContainer: {
    padding: 16,
    gap: 20,
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
  errorIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorIconText: {
    fontSize: 28,
    fontWeight: '700',
    color: lightColors.error,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: lightColors.text,
    marginTop: 8,
  },
  errorMessage: {
    fontSize: 14,
    color: lightColors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  retryButton: {
    backgroundColor: lightColors.primary,
    borderRadius: 10,
    paddingHorizontal: 24,
    paddingVertical: 14,
    marginTop: 8,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: lightColors.text,
  },
  avatarContainer: {
    alignItems: 'center',
    marginTop: 8,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: palette.spartanRed,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 32,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  section: {
    gap: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: lightColors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  card: {
    backgroundColor: lightColors.surface,
    borderRadius: 14,
    padding: 16,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  fieldIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: lightColors.background,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  fieldContent: {
    flex: 1,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: lightColors.textMuted,
    marginBottom: 2,
  },
  fieldValue: {
    fontSize: 15,
    color: lightColors.text,
    fontWeight: '500',
  },
  fieldInput: {
    backgroundColor: lightColors.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: lightColors.border,
    padding: 12,
    fontSize: 15,
    color: lightColors.text,
  },
  fieldInputMultiline: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.spartanRed,
    borderRadius: 14,
    paddingVertical: 18,
    gap: 8,
    minHeight: 60,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: palette.spartanRed,
  },
  signOutButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: palette.spartanRed,
  },
});