import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  FlatList,
  Platform,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  MobileAuthStackParamList,
  ROLES,
  Role,
  ALL_CAMPUSES,
  getCampusLabel,
  Campus,
} from '@spartan-g/shared-types';
import { lightColors } from '@spartan-g/shared-ui';
import { useAuthStore } from '@spartan-g/shared-services';
import { AuthInput } from '../../components/ui/AuthInput';
import { PrimaryButton } from '../../components/ui/PrimaryButton';

type Props = NativeStackScreenProps<MobileAuthStackParamList, 'Register'>;

export function RegisterScreen({ navigation }: Props) {
  const register = useAuthStore((s) => s.register);
  const status = useAuthStore((s) => s.status);
  const authError = useAuthStore((s) => s.error);
  const clearError = useAuthStore((s) => s.clearError);

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [selectedCampus, setSelectedCampus] = useState<Campus | null>(null);
  const [selectedRole, setSelectedRole] = useState<Role>(ROLES.STUDENT);
  const [campusPickerVisible, setCampusPickerVisible] = useState(false);

  const isLoading = status === 'loading';
  const passwordsMatch = password === confirmPassword;
  const canSubmit =
    !!displayName.trim() &&
    !!email.trim() &&
    !!password.trim() &&
    !!confirmPassword.trim() &&
    !!selectedCampus &&
    passwordsMatch;

  const handleRegister = async () => {
    if (!canSubmit) return;
    clearError();
    try {
      await register({
        email: email.trim(),
        password,
        displayName,
        role: selectedRole,
        campus: selectedCampus!,
      });
    } catch {
      // Error is surfaced via the store
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Create Account</Text>
        <Text style={styles.subtitle}>Join the SPARTAN-G community</Text>
      </View>

      <AuthInput
        label="Full Name"
        placeholder="Juan Dela Cruz"
        textContentType="name"
        value={displayName}
        onChangeText={setDisplayName}
      />
      <AuthInput
        label="Email"
        placeholder="you@spartang.edu"
        keyboardType="email-address"
        textContentType="emailAddress"
        value={email}
        onChangeText={setEmail}
      />
      <AuthInput
        label="Password"
        placeholder=""
        secureTextEntry
        textContentType="newPassword"
        value={password}
        onChangeText={setPassword}
        error={!passwordsMatch && confirmPassword ? 'Passwords do not match' : undefined}
            />
      <AuthInput
        label="Confirm Password"
        placeholder=""
        secureTextEntry
        textContentType="newPassword"
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        error={!passwordsMatch && confirmPassword ? 'Passwords do not match' : undefined}
      />
            {/* Campus Selector */}
      <View style={styles.pickerContainer}>
        <Text style={styles.pickerLabel}>Campus</Text>
        <TouchableOpacity
          style={[styles.pickerButton, !selectedCampus && styles.pickerButtonPlaceholder]}
          onPress={() => setCampusPickerVisible(true)}
        >
          <Text
            style={[
              styles.pickerButtonText,
              !selectedCampus && styles.pickerButtonTextPlaceholder,
            ]}
          >
            {selectedCampus ? getCampusLabel(selectedCampus) : 'Select your campus'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Role Selector */}
      <View style={styles.roleContainer}>
        <Text style={styles.roleLabel}>I am a</Text>
        <View style={styles.roleOptions}>
          <TouchableOpacity
            style={[styles.roleOption, selectedRole === ROLES.STUDENT && styles.roleOptionSelected]}
            onPress={() => setSelectedRole(ROLES.STUDENT)}
          >
            <View style={styles.radioButton}>
              {selectedRole === ROLES.STUDENT && <View style={styles.radioInner} />}
            </View>
            <Text style={styles.roleText}>Student</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.roleOption, selectedRole === ROLES.FACILITATOR && styles.roleOptionSelected]}
            onPress={() => setSelectedRole(ROLES.FACILITATOR)}
          >
            <View style={styles.radioButton}>
              {selectedRole === ROLES.FACILITATOR && <View style={styles.radioInner} />}
            </View>
            <Text style={styles.roleText}>Facilitator</Text>
          </TouchableOpacity>
        </View>
      </View>

      {authError ? <Text style={styles.errorText}>{authError}</Text> : null}

      <PrimaryButton
        title="Create Account"
        loading={isLoading}
        disabled={!canSubmit}
        onPress={handleRegister}
      />

      <TouchableOpacity style={styles.cancelLink} onPress={() => navigation.navigate('Login')}>
        <Text style={styles.link}>Already have an account? Sign In</Text>
      </TouchableOpacity>

      {/* Campus Picker Modal */}
      <Modal
        visible={campusPickerVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setCampusPickerVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select Campus</Text>
            <FlatList
              data={ALL_CAMPUSES}
              keyExtractor={(item) => item}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.campusOption}
                  onPress={() => {
                    setSelectedCampus(item);
                    setCampusPickerVisible(false);
                  }}
                >
                  <Text style={styles.campusOptionText}>{getCampusLabel(item)}</Text>
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity
              style={[styles.campusOption, styles.campusOptionLast]}
              onPress={() => setCampusPickerVisible(false)}
            >
              <Text style={[styles.campusOptionText, styles.cancelLinkText]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingVertical: 48,
    backgroundColor: lightColors.background,
    gap: 8,
  },
  header: { gap: 8, marginBottom: 24 },
  title: { fontSize: 28, fontWeight: '700', color: lightColors.text },
  subtitle: { fontSize: 15, color: lightColors.textSecondary },
  pickerContainer: { marginBottom: 16 },
  pickerLabel: { fontSize: 14, fontWeight: '600', color: lightColors.text, marginBottom: 6 },
  pickerButton: {
    height: 48,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: lightColors.surface,
    borderWidth: 1,
    borderColor: lightColors.border,
    borderRadius: 8,
    justifyContent: 'center',
  },
  pickerButtonPlaceholder: { borderColor: lightColors.border },
  pickerButtonText: { fontSize: 16, color: lightColors.text },
  pickerButtonTextPlaceholder: { color: lightColors.textMuted },
  roleContainer: { marginBottom: 16 },
  roleLabel: { fontSize: 14, fontWeight: '600', color: lightColors.text, marginBottom: 8 },
  roleOptions: { flexDirection: 'row', gap: 16 },
  roleOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: lightColors.border,
    borderRadius: 8,
    flex: 1,
  },
  roleOptionSelected: {
    borderColor: lightColors.primary,
    backgroundColor: lightColors.background,
  },
  radioButton: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: lightColors.textSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: lightColors.primary },
  roleText: { fontSize: 14, color: lightColors.text, fontWeight: '500' },
  errorText: { fontSize: 13, color: lightColors.error, textAlign: 'center', marginBottom: 8 },
  cancelLink: { marginTop: 16, alignItems: 'center' },
  link: { fontSize: 14, color: lightColors.primary, fontWeight: '600' },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContent: {
    backgroundColor: lightColors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '60%',
    paddingBottom: Platform.select({ ios: 20, android: 0 }),
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: lightColors.text,
    textAlign: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: lightColors.border,
  },
  campusOption: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: lightColors.border,
  },
  campusOptionLast: { borderBottomWidth: 0 },
  campusOptionText: { fontSize: 16, color: lightColors.text },
  cancelLinkText: {
    color: lightColors.textSecondary,
    textAlign: 'center',
    fontWeight: '500',
  },
});
