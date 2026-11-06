import { useState, useSyncExternalStore } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { useAppLock } from '../security/app-lock';
import { ProfileToggle, profileStyles as styles } from '../screens/profile/ProfileDesign';
import { phonePreferences, currentPhoneOwner, usePhonePreferences } from './phone-preferences';
import { preparePhonePermission } from './native-preparation';
import { notificationContext, installedNotificationRuntime } from './runtime';
import type { PhonePreferences } from '@spartan-g/shared-services/src/notifications/push-contract';
import type { RegistrationStatus } from './automatic-registration';

const DISABLED_REGISTRATION: RegistrationStatus = Object.freeze({ phase: 'disabled', busy: false, attempts: 0 });
const noRegistration = () => DISABLED_REGISTRATION, noSubscription = () => () => {};
const registrationText: Record<RegistrationStatus['phase'], string> = {
  disabled: 'Device registration: inactive in this release. No token is requested automatically.',
  'consent-required': 'Device registration: waiting for your notification consent.',
  'permission-required': 'Device registration: Android notification permission is required.',
  'waiting-for-unlock': 'Device registration: waiting for an active, unlocked account.',
  registering: 'Device registration: securely registering this phone...',
  registered: 'Device registration: acknowledged for this account. This does not prove notification delivery.',
  'retry-pending': 'Device registration: connection not confirmed. A limited foreground retry is pending.',
  offline: 'Device registration: not confirmed. Reconnect and retry; no delivery is promised.',
  'cleanup-pending': 'Device registration: previous account cleanup is pending. Reconnect before registering again.',
};

export function PhoneNotificationPreparation() {
  // Keep the existing readiness guard reactive; do not enable remote delivery.
  useAppLock();
  const state = usePhonePreferences(), owner = currentPhoneOwner();
  const runtime = installedNotificationRuntime?.();
  const registration = useSyncExternalStore(runtime?.subscribe ?? noSubscription, runtime?.getSnapshot ?? noRegistration, noRegistration);
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const ready = !!owner && state.owner === owner && state.status === 'ready' && notificationContext().ready && Platform.OS === 'android';
  const disabled = !ready || state.saving || busy;
  const change = async (field: keyof PhonePreferences, value: boolean) => {
    const actor = notificationContext();
    if (disabled || !owner || !actor.ready) return;
    setBusy(true); setError(null);
    try {
      if (field === 'phoneEnabled' && value) {
        const result = await preparePhonePermission();
        if (result !== 'granted') { setError(result === 'blocked' ? 'Android notifications are blocked. Review device notification settings; no delivery has been enabled.' : 'Notification permission was not granted. Phone notification preparation remains off.'); return; }
      }
      const current = notificationContext();
      if (current.owner !== actor.owner || current.session !== actor.session || !current.ready || currentPhoneOwner() !== owner) return;
      await phonePreferences.update(owner, field, value);
      if (runtime) {
        if (field === 'phoneEnabled' && !value) { if (!await runtime.revoke()) setError('Remote cleanup is pending. Reconnect before switching accounts; queued generic alerts cannot be recalled.'); }
        else if (!await runtime.synchronize()) setError('Staging registration is not confirmed. Check Android permission, connection and the approved staging test window.');
      }
    } catch { setError('Notification preferences could not be confirmed. No delivery is promised.');
    } finally { setBusy(false); }
  };
  return <>
    <Text accessibilityRole="header" style={styles.section}>{runtime ? 'STAGING PHONE NOTIFICATIONS' : 'PHONE NOTIFICATIONS — PREPARATION'}</Text>
    <View style={styles.notice}><Text style={styles.noticeText}>{runtime ? 'Synthetic staging test only. Android permission and an acknowledged device registration are both required. The server test window and each category must also allow delivery; a registration is not proof of phone receipt.' : 'Push delivery is not active. These account-specific choices are saved on this device only. They do not register a device or stop pushes already queued by an older version. Server preference enforcement and delivery need separate activation.'}</Text></View>
    <Text testID="automatic-device-registration-status" accessibilityLiveRegion="polite" style={styles.neutral}>{registrationText[registration.phase]}</Text>
    {!!runtime && ['offline', 'cleanup-pending'].includes(registration.phase) && <Pressable testID="automatic-registration-retry" accessibilityRole="button" accessibilityLabel="Retry secure phone registration"
      accessibilityState={{ disabled: disabled || registration.busy }} disabled={disabled || registration.busy} style={styles.action} onPress={() => void runtime.retryRegistration()}><Text style={styles.actionText}>Retry secure registration</Text></Pressable>}
    <ProfileToggle testID="phone-preparation-master" title={runtime ? 'Allow staging phone notifications' : 'Prepare phone notifications'} subtitle={runtime ? 'Check permission and request a secure staging registration.' : 'Save your choice and check Android permission. Remote delivery remains inactive.'} icon="bell" value={ready && state.values.phoneEnabled} disabled={disabled} onChange={v => void change('phoneEnabled', v)} />
    <ProfileToggle testID="phone-preparation-messages" title="Messages" subtitle="Use a generic new-message notification when secure delivery is activated." icon="message-square" value={ready && state.values.messages} disabled={disabled} onChange={v => void change('messages', v)} />
    <ProfileToggle testID="phone-preparation-appointments" title="Appointments" subtitle={runtime ? 'Generic updates and approved test reminders only.' : 'Generic appointment updates. Scheduled reminders are not active.'} icon="calendar" value={ready && state.values.appointments} disabled={disabled} onChange={v => void change('appointments', v)} />
    <ProfileToggle testID="phone-preparation-assessments" title="Assessment updates" subtitle={runtime ? 'Approved synthetic catalog publication updates only.' : 'Saved preference only. Publication audiences and delivery remain pending.'} icon="file-text" value={ready && state.values.assessmentUpdates} disabled={disabled} onChange={v => void change('assessmentUpdates', v)} />
    {!!runtime && <Text accessibilityLiveRegion="polite" style={styles.neutral}>{runtime.getBinding() ? 'Staging device registration acknowledged. Delivery is still controlled by the server test window and Android.' : 'No current staging device registration confirmed.'}</Text>}
    <Text accessibilityLiveRegion="polite" style={styles.neutral}>{busy || state.saving ? 'Saving local preparation...' : state.status === 'loading' ? 'Loading local phone preferences...' : 'Background sounds remain controlled by Android notification channels. Quiet hours are not activated.'}</Text>
    {!!(error || state.error) && <Text accessibilityLiveRegion="polite" style={styles.error}>{error || state.error}</Text>}
  </>;
}
