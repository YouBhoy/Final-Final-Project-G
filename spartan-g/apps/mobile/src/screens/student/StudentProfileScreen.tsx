import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TextInput,
  Modal,
  FlatList,
  Alert,
} from 'react-native';
import { useAuthStore, userService, userRepository, profileRepository } from '@spartan-g/shared-services';
import type { UserDocument, ProfileDocument } from '@spartan-g/shared-types';
import { lightColors, palette } from '@spartan-g/shared-ui';
import { Feather } from '@expo/vector-icons';

/* ─── Data Constants ──────────────────────────────────────────── */

const YEAR_LEVELS = ['1st Year', '2nd Year', '3rd Year', '4th Year', '5th Year'];

const CAMPUSES = [
  'Pablo Borbon (Main)',
  'Alangilan',
  'Lipa',
  'Nasugbu',
  'Malvar',
  'Rosario',
  'San Juan',
  'Balayan',
  'Lemery',
  'Lobo',
  'Mabini',
  'LIMA (Aboitiz)',
];

const COLLEGES_AND_PROGRAMS: Record<string, string[]> = {
  'Informatics and Computing Sciences': [
    'BS Computer Science',
    'BS Information Technology',
  ],
  'Engineering Technology': [
    'Bachelor of Automotive Engineering Technology',
    'Bachelor of Civil Engineering Technology',
    'Bachelor of Computer Engineering Technology',
    'Bachelor of Drafting Engineering Technology',
    'Bachelor of Electrical Engineering Technology',
    'Bachelor of Electronics Engineering Technology',
    'Bachelor of Food Engineering Technology',
    'Bachelor of Instrumentation and Control Engineering Technology',
    'Bachelor of Mechanical Engineering Technology',
    'Bachelor of Mechatronics Engineering Technology',
    'Bachelor of Welding and Fabrication Engineering Technology',
  ],
  'Engineering': [
    'BS Chemical Engineering',
    'BS Civil Engineering',
    'BS Computer Engineering',
    'BS Electrical Engineering',
    'BS Electronics Engineering',
    'BS Industrial Engineering',
    'BS Mechanical Engineering',
    'BS Sanitary Engineering',
  ],
  'Architecture, Fine Arts and Design': [
    'BS Architecture',
    'BS Interior Design',
    'Bachelor of Fine Arts and Design (Visual Communication)',
  ],
  'Other': ['Other (not listed)'],
};

const COLLEGE_NAMES = Object.keys(COLLEGES_AND_PROGRAMS);

/* ─── Custom Picker Component ─────────────────────────────────── */

interface PickerFieldProps {
  label: string;
  value: string;
  options: string[];
  onSelect: (value: string) => void;
  icon: string;
}

function PickerField({ label, value, options, onSelect, icon }: PickerFieldProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <View style={styles.fieldRow}>
      <View style={styles.fieldIconContainer}>
        <Feather name={icon as any} size={16} color={lightColors.textMuted} />
      </View>
      <View style={styles.fieldContent}>
        <Text style={styles.fieldLabel}>{label}</Text>
        <TouchableOpacity
          style={styles.pickerButton}
          onPress={() => setIsOpen(true)}
          activeOpacity={0.7}
        >
          <Text style={[styles.pickerButtonText, !value && styles.pickerPlaceholder]}>
            {value || `Select ${label.toLowerCase()}`}
          </Text>
          <Feather name="chevron-down" size={16} color={lightColors.textMuted} />
        </TouchableOpacity>
      </View>

      <Modal visible={isOpen} transparent animationType="fade" onRequestClose={() => setIsOpen(false)}>
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setIsOpen(false)}
        >
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{label}</Text>
            <FlatList
              data={options}
              keyExtractor={(item) => item}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.modalOption,
                    item === value && styles.modalOptionSelected,
                  ]}
                  onPress={() => {
                    onSelect(item);
                    setIsOpen(false);
                  }}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.modalOptionText,
                      item === value && styles.modalOptionTextSelected,
                    ]}
                  >
                    {item}
                  </Text>
                  {item === value && (
                    <Feather name="check" size={18} color={palette.spartanRed} />
                  )}
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

/* ─── Read-Only Field Component ───────────────────────────────── */

function ReadOnlyField({ label, value, icon }: { label: string; value: string; icon: string }) {
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

/* ─── Editable Text Field Component ───────────────────────────── */

function EditTextField({
  label,
  value,
  onChange,
  icon,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  icon: string;
}) {
  return (
    <View style={styles.fieldRow}>
      <View style={styles.fieldIconContainer}>
        <Feather name={icon as any} size={16} color={lightColors.textMuted} />
      </View>
      <View style={styles.fieldContent}>
        <Text style={styles.fieldLabel}>{label}</Text>
        <TextInput
          style={styles.fieldInput}
          value={value}
          onChangeText={onChange}
          placeholder={`Enter ${label.toLowerCase()}`}
          placeholderTextColor={lightColors.textMuted}
        />
      </View>
    </View>
  );
}

/* ─── Main Screen ─────────────────────────────────────────────── */

export function StudentProfileScreen() {
  const session = useAuthStore((s) => s.session);
  const signOut = useAuthStore((s) => s.signOut);

  const [user, setUser] = useState<UserDocument | null>(null);
  const [profile, setProfile] = useState<ProfileDocument | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  // Editable fields
  const [displayName, setDisplayName] = useState('');
  const [yearLevel, setYearLevel] = useState('');
  const [campus, setCampus] = useState('');
  const [college, setCollege] = useState('');
  const [course, setCourse] = useState('');

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
        setYearLevel(profileDoc.yearLevel || '');
        setCampus(profileDoc.campus || '');
        setCollege(profileDoc.college || '');
        setCourse(profileDoc.course || '');
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

    setIsSaving(true);

    try {
      // Step 1: Update displayName on UserDocument
      if (displayName !== (user?.displayName || '')) {
        await userRepository.update(session.uid, { displayName } as Partial<UserDocument>);
        // Sync the in-memory session so the Dashboard greeting reflects the new name immediately
        useAuthStore.getState().setSession({ ...session, displayName });
      }

      // Step 2: Update profile fields on ProfileDocument
      const profileData: Partial<ProfileDocument> = {
        yearLevel: yearLevel || undefined,
        campus: campus || undefined,
        college: college || undefined,
        course: course || undefined,
      };
      await profileRepository.update(session.uid, profileData);

      Alert.alert('Success', 'Your profile has been updated.', [
        { text: 'OK', onPress: () => { setIsEditing(false); load(); } },
      ]);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save profile';
      Alert.alert('Error', message);
    } finally {
      setIsSaving(false);
    }
  }, [session, user, displayName, yearLevel, campus, college, course, load]);

  const handleCancel = useCallback(() => {
    // Reset to original values
    if (user) setDisplayName(user.displayName || '');
    if (profile) {
      setYearLevel(profile.yearLevel || '');
      setCampus(profile.campus || '');
      setCollege(profile.college || '');
      setCourse(profile.course || '');
    }
    setIsEditing(false);
  }, [user, profile]);

  const handleSignOut = useCallback(async () => {
    await signOut();
  }, [signOut]);

  const handleCollegeSelect = useCallback((collegeName: string) => {
    setCollege(collegeName);
    // Reset course when college changes
    setCourse('');
  }, []);

  // Determine if course should be a dropdown or free-text
  const isOtherCollege = college === 'Other';
  const courseOptions = college && !isOtherCollege
    ? (COLLEGES_AND_PROGRAMS[college] || [])
    : [];

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
    <View style={styles.container}>
      {/* ─── Greeting row on maroon background ─────────────────── */}
      <View style={styles.greetingRow}>
        <Text style={styles.greetingText}>My Profile</Text>
        <View style={styles.headerActions}>
          {!isEditing ? (
            <TouchableOpacity
              style={styles.editButton}
              onPress={() => setIsEditing(true)}
              activeOpacity={0.7}
            >
              <Feather name="edit-2" size={18} color="#FFFFFF" />
              <Text style={styles.editButtonLabel}>Edit</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            style={styles.logoutButton}
            onPress={handleSignOut}
            activeOpacity={0.7}
          >
            <Feather name="log-out" size={20} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>

      {/* ─── White content sheet ───────────────────────────────── */}
      <ScrollView style={styles.sheetScroll} contentContainerStyle={styles.sheetContent}>
        {/* Avatar */}
        <View style={styles.avatarContainer}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {(displayName || 'U').charAt(0).toUpperCase()}
            </Text>
          </View>
        </View>

        {/* Account Information (read-only) */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account Information</Text>
          <View style={styles.card}>
            <ReadOnlyField label="Email" value={session?.email || ''} icon="mail" />
            <ReadOnlyField label="Role" value={session?.role || 'student'} icon="shield" />
          </View>
        </View>

        {/* Profile Details */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Profile Details</Text>
          <View style={styles.card}>
            {isEditing ? (
              <>
                <EditTextField
                  label="Name"
                  value={displayName}
                  onChange={setDisplayName}
                  icon="user"
                />
                <PickerField
                  label="Year Level"
                  value={yearLevel}
                  options={YEAR_LEVELS}
                  onSelect={setYearLevel}
                  icon="layers"
                />
                <PickerField
                  label="Campus"
                  value={campus}
                  options={CAMPUSES}
                  onSelect={setCampus}
                  icon="map-pin"
                />
                <PickerField
                  label="College"
                  value={college}
                  options={COLLEGE_NAMES}
                  onSelect={handleCollegeSelect}
                  icon="book"
                />
                {isOtherCollege ? (
                  <EditTextField
                    label="Course"
                    value={course}
                    onChange={setCourse}
                    icon="file-text"
                  />
                ) : courseOptions.length > 0 ? (
                  <PickerField
                    label="Course"
                    value={course}
                    options={courseOptions}
                    onSelect={setCourse}
                    icon="file-text"
                  />
                ) : (
                  <EditTextField
                    label="Course"
                    value={course}
                    onChange={setCourse}
                    icon="file-text"
                  />
                )}
              </>
            ) : (
              <>
                <ReadOnlyField label="Name" value={displayName} icon="user" />
                <ReadOnlyField label="Year Level" value={yearLevel} icon="layers" />
                <ReadOnlyField label="Campus" value={campus} icon="map-pin" />
                <ReadOnlyField label="College" value={college} icon="book" />
                <ReadOnlyField label="Course" value={course} icon="file-text" />
              </>
            )}
          </View>
        </View>

        {/* Edit mode: Save / Cancel buttons */}
        {isEditing && (
          <View style={styles.editActions}>
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
            <TouchableOpacity
              onPress={handleCancel}
              style={styles.cancelButton}
              disabled={isSaving}
              activeOpacity={0.8}
            >
              <Feather name="x-circle" size={20} color={palette.spartanRed} />
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            © {new Date().getFullYear()} Batangas State University · The National Engineering University
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

/* ─── Styles ──────────────────────────────────────────────────── */

const styles = StyleSheet.create({
  /* ─── Full-bleed container (maroon background) ──────────── */
  container: {
    flex: 1,
    backgroundColor: palette.spartanRedDark,
  },

  /* ─── Greeting row (on maroon) ──────────────────────────── */
  greetingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 16,
    backgroundColor: palette.spartanRedDark,
  },
  greetingText: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  editButtonLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  logoutButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* ─── White content sheet ────────────────────────────────── */
  sheetScroll: {
    flex: 1,
  },
  sheetContent: {
    backgroundColor: palette.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 16,
    paddingTop: 20,
    paddingBottom: 32,
    gap: 16,
  },

  /* ─── Center (loading/error) ─────────────────────────────── */
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

  /* ─── Avatar ─────────────────────────────────────────────── */
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

  /* ─── Sections ───────────────────────────────────────────── */
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

  /* ─── Field rows ─────────────────────────────────────────── */
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

  /* ─── Picker ─────────────────────────────────────────────── */
  pickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: lightColors.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: lightColors.border,
    padding: 12,
    minHeight: 44,
  },
  pickerButtonText: {
    fontSize: 15,
    color: lightColors.text,
    flex: 1,
  },
  pickerPlaceholder: {
    color: lightColors.textMuted,
  },

  /* ─── Modal ──────────────────────────────────────────────── */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: palette.white,
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxHeight: '70%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: lightColors.text,
    marginBottom: 12,
  },
  modalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  modalOptionSelected: {
    backgroundColor: palette.red50,
  },
  modalOptionText: {
    fontSize: 15,
    color: lightColors.text,
    flex: 1,
  },
  modalOptionTextSelected: {
    fontWeight: '600',
    color: palette.spartanRed,
  },

  /* ─── Edit actions ───────────────────────────────────────── */
  editActions: {
    gap: 10,
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
  cancelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: palette.spartanRed,
    backgroundColor: palette.white,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: palette.spartanRed,
  },

  /* ─── Footer ─────────────────────────────────────────────── */
  footer: {
    borderTopWidth: 1,
    borderTopColor: lightColors.border,
    paddingTop: 16,
    marginTop: 8,
  },
  footerText: {
    fontSize: 11,
    color: lightColors.textMuted,
    textAlign: 'center',
    lineHeight: 16,
  },
});