import { useEffect } from 'react';
import { AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useAuthStore } from '@spartan-g/shared-services';
import { appLock } from '../security/app-lock';
import { navigationRef } from '../navigation/navigationRef';
import { createTapCoordinator, type PushRoute, type TapContext } from './tap-coordinator';
import { notificationContext, installedNotificationRuntime } from './runtime';

export function navigatePushRoute(route: PushRoute, context: TapContext) {
  if (!navigationRef.isReady() || !context.ready) return;
  if (context.role === 'student') {
    if (route.name === 'conversation') navigationRef.navigate('Student', { screen: 'ConversationDetail', params: { conversationId: route.conversationId } });
    else navigationRef.navigate('Student', { screen: 'StudentTabs', params: { screen: route.name === 'appointments' ? 'StudentAppointments' : route.name === 'home' ? 'StudentHome' : 'StudentAssignments' } });
  } else if (context.role === 'facilitator') {
    if (route.name === 'conversation') navigationRef.navigate('Facilitator', { screen: 'ConversationDetail', params: { conversationId: route.conversationId } });
    else if (route.name === 'appointments') navigationRef.navigate('Facilitator', { screen: 'FacilitatorTabs', params: { screen: 'Appointments' } });
    else if (route.name === 'home') return; // System announcements target students only.
    else navigationRef.navigate('Facilitator', { screen: 'FacilitatorAssessmentsList' });
  }
}
/** One response listener outside the protected tree; never prompts biometrics itself. */
export function NotificationCoordinator() {
  useEffect(() => {
    let disposed = false, previousOwner = notificationContext().owner;
    const coordinator = createTapCoordinator({
      now: Date.now,
      context: () => { const value = notificationContext(); return { ...value, ready: value.ready && navigationRef.isReady() }; },
      // The production slot is null. Future activation uses the authenticated resolver,
      // never a route or URL supplied by the notification itself.
      resolve: async (envelope, context) => installedNotificationRuntime()?.resolve(envelope, context) ?? null,
      navigate: navigatePushRoute,
    });
    const synchronize = () => {
      const owner = notificationContext().owner;
      if (previousOwner && previousOwner !== owner) {
        void Notifications.dismissAllNotificationsAsync().catch(() => {});
        void Notifications.clearLastNotificationResponseAsync().catch(() => {});
      }
      previousOwner = owner; coordinator.synchronize(); void coordinator.drain();
      const runtime = installedNotificationRuntime();
      if (runtime) void runtime.synchronize().then(() => coordinator.drain()).catch(() => {});
    };
    const accept = (response: Notifications.NotificationResponse | null) => {
      if (disposed || !response) return;
      coordinator.accept(response.notification.request.content);
      void Notifications.clearLastNotificationResponseAsync().catch(() => {});
    };
    const listener = Notifications.addNotificationResponseReceivedListener(accept);
    void Notifications.getLastNotificationResponseAsync().then(accept).catch(() => {});
    const auth = useAuthStore.subscribe(synchronize), security = appLock.subscribe(synchronize);
    const navigation = navigationRef.addListener('state', synchronize);
    const navigationReady = navigationRef.addListener('ready', synchronize);
    const lifecycle = AppState.addEventListener('change', synchronize);
    return () => { disposed = true; coordinator.stop(); listener.remove(); auth(); security(); navigation(); navigationReady(); lifecycle.remove(); };
  }, []);
  return null;
}
