import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { lightColors } from '@spartan-g/shared-ui';
import {
  useAuthStore,
  userService,
} from '@spartan-g/shared-services';
import {
  getCampusLabel,
  ROLE_LABELS,
} from '@spartan-g/shared-types';
import { useEffect, useState } from 'react';

export function ProfileScreen() {
  const session = useAuthStore((s) => s.session);
  const signOut = useAuthStore((s) => s.signOut);

  const [bio, setBio] = useState<string | null>(null);
  const [phone, setPhone] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!session?.uid) return;
    let active = true;
    userService
      .getProfile(session.uid)
      .then((profile) => {
        if (!active) return;
        setBio(profile?.bio ?? null);
        setPhone(profile?.phone ?? null);
      })
      .catch(() => {
        // Non-critical; ignore profile fetch errors
      });
    return () => {
      active = false;
    };
  }, [session?.uid]);

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          setLoading(true);
          try {
            await signOut();
          } catch {
            setLoading(false);
          }
        },
      },
    ]);
  };

  if (!session) return null;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.avatarCircle}>
        <Text style={styles.avatarText}>
          {session.displayName?.charAt(0)?.toUpperCase() ?? '?'}
        </Text>
      </View>

      <Text style={styles.name}>{session.displayName ?? 'Unnamed User'}</Text>
      <View style={styles.roleBadge}>
        <Text style={styles.roleBadgeText}>{ROLE_LABELS[session.role]}</Text>
      </View>

      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.label}>Email</Text>
          <Text style={styles.value}>{session.email ?? '—'}</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.row}>
          <Text style={styles.label}>Campus</Text>
          <Text style={styles.value}>{getCampusLabel(session.campus)}</Text>
        </View>
        {phone ? (
          <>
            <View style={styles.divider} />
            <View style={styles.row}>
              <Text style={styles.label}>Phone</Text>
              <Text style={styles.value}>{phone}</Text>
            </View>
          </>
        ) : null}
        {bio ? (
          <>
            <View style={styles.divider} />
            <View style={styles.row}>
              <Text style={styles.label}>Bio</Text>
              <Text style={styles.value}>{bio}</Text>
            </View>
          </>
        ) : null}
      </View>

      <TouchableOpacity
        style={styles.signOutButton}
        onPress={handleSignOut}
        disabled={loading}
      >
        <Text style={styles.signOutText}>{loading ? 'Signing out…' : 'Sign Out'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingVertical: 40,
    backgroundColor: lightColors.background,
    alignItems: 'center',
  },
  avatarCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: lightColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  avatarText: {
    fontSize: 40,
    fontWeight: '700',
    color: lightColors.surface,
  },
  name: {
    fontSize: 24,
    fontWeight: '700',
    color: lightColors.text,
    textAlign: 'center',
  },
  roleBadge: {
    marginTop: 8,
    marginBottom: 24,
    backgroundColor: lightColors.accent,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  roleBadgeText: {
    fontSize: 13,
    fontWeight: '600',
    color: lightColors.text,
  },
  card: {
    width: '100%',
    backgroundColor: lightColors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: lightColors.border,
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 12,
    gap: 16,
  },
  label: {
    fontSize: 14,
    color: lightColors.textMuted,
    flexShrink: 0,
  },
  value: {
    fontSize: 14,
    color: lightColors.text,
    fontWeight: '500',
    flexShrink: 1,
    textAlign: 'right',
  },
  divider: {
    height: 1,
    backgroundColor: lightColors.border,
  },
  signOutButton: {
    width: '100%',
    height: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: lightColors.error,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signOutText: {
    fontSize: 16,
    fontWeight: '600',
    color: lightColors.error,
  },
});