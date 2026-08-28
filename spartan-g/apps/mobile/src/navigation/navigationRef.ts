import { createNavigationContainerRef } from '@react-navigation/native';
import type { MobileRootStackParamList } from '@spartan-g/shared-types';

/**
 * Module-level navigation ref so code OUTSIDE the React tree — specifically the
 * expo-notifications foreground handler in expo-messaging.adapter.ts — can read
 * the active route. NavigationContainer in RootNavigator attaches to this ref,
 * replacing the component-scoped ref it previously used.
 */
export const navigationRef = createNavigationContainerRef<MobileRootStackParamList>();

/**
 * The conversationId whose ConversationDetail screen is currently on top, or null.
 *
 * Used to suppress foreground notification banners for messages the user can
 * already see arriving live in the open thread. Works identically for the
 * Student and Facilitator navigators because both register their conversation
 * screen under the same route name ('ConversationDetail', param conversationId),
 * and real-time Firestore subscriptions mean the visible screen already
 * reflects the incoming message.
 *
 * Safe-by-default: any failure (nav container not yet mounted, unexpected
 * shape) yields null → caller should SHOW the banner.
 */
export function getOpenConversationId(): string | null {
  try {
    const currentRoute = navigationRef.current?.getCurrentRoute();

    // Loosened shape on purpose: getCurrentRoute()'s type is keyed by the ROOT
    // param list (Auth/Student/Facilitator) even though at runtime it returns
    // the deepest active route — e.g. ConversationDetail inside a role
    // navigator. Narrowing strictly against the root union breaks compilation.
    const route = currentRoute as unknown as
      | { name?: string; params?: { conversationId?: unknown } }
      | undefined;

    if (!route || route.name !== 'ConversationDetail') return null;

    const params = route.params;
    return typeof params?.conversationId === 'string' && params.conversationId
      ? params.conversationId
      : null;
  } catch {
    return null;
  }
}