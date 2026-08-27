/**
 * SPARTAN-G — Server-side push notifications (Cloud Functions for Firebase)
 *
 * Replaces client-side push sending (previously performed by the sender's
 * device via shared-services/push-notification.service.ts) so notifications
 * are delivered reliably by the backend regardless of whether the sender's
 * app stays open/connected.
 *
 * Payload parity contract (CRITICAL — do not drift):
 * - Messages:   title = sender displayName ?? 'New Message'
 *               body  = original body if <=100 chars else slice(0,97)+'...'
 *               data  = { url: spartan-g://{student|facilitator}/conversation/{conversationId} }
 *               The mobile foreground-banner suppression logic in
 *               apps/mobile/src/adapters/expo-messaging.adapter.ts parses this
 *               exact URL shape to suppress banners when the thread is open.
 * - Appointments: title = 'New Appointment Request'
 *               body  = 'A student has requested an appointment at <time>.'
 *               data  = { url: 'spartan-g://facilitator/appointments', appointmentId }
 *
 * Android channel: every push carries channelId 'default' — the MAX-importance
 * channel registered by the mobile adapter. Required for foreground (app-open)
 * heads-up banners.
 */

import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { logger, setGlobalOptions } from 'firebase-functions';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import Expo, { type ExpoPushMessage } from 'expo-server-sdk';

setGlobalOptions({ region: 'us-central1', maxInstances: 5 });

initializeApp();
const db = getFirestore();

// Optional but recommended: raises Expo push rate limits once configured via
// `firebase functions:secrets:set EXPO_ACCESS_TOKEN`.
const expo = new Expo({
  accessToken: process.env.EXPO_ACCESS_TOKEN,
});

const COLL = {
  users: 'users',
  conversations: 'conversations',
  notifications: 'notifications',
  deviceTokens: 'device_tokens',
  appointments: 'appointments',
} as const;

/** Deep-link prefix per recipient role — mirrors messaging.service.ts logic. */
function deepLinkPrefixForRole(role?: string): string {
  return role === 'facilitator' ? 'facilitator' : 'student';
}

/** Mirrors client: trim, cap at 100 chars with trailing '...'. */
function truncateBody(body: string): string {
  const trimmed = body.trim();
  return trimmed.length > 100 ? `${trimmed.slice(0, 97)}...` : trimmed;
}

interface UserBrief {
  displayName?: string;
  role?: string;
}

async function getUserBrief(uid: string): Promise<UserBrief | null> {
  const snap = await db.collection(COLL.users).doc(uid).get();
  // Note: firebase-admin 12+ exposes `exists` as a boolean property.
  return snap.exists ? ((snap.data() ?? null) as UserBrief | null) : null;
}

async function getDeviceTokens(uid: string): Promise<string[]> {
  const snap = await db
    .collection(COLL.deviceTokens)
    .where('uid', '==', uid)
    .get();
  return snap.docs.map((d) => String(d.data().token)).filter(Boolean);
}

/**
 * Send a push through the Expo Push API to one user's devices.
 * Logs ticket errors (incl. DeviceNotRegistered) without throwing — delivery
 * failures must never fail the triggering write path.
 */
async function pushToUser(
  uid: string,
  title: string,
  body: string,
  data: Record<string, string>,
): Promise<void> {
  const rawTokens = await getDeviceTokens(uid);
  const tokens = rawTokens.filter((t) => {
    const valid = Expo.isExpoPushToken(t);
    if (!valid) logger.warn(`[push] Skipping malformed token for ${uid}`);
    return valid;
  });

  if (!tokens.length) {
    logger.info(`[push] No registered devices for ${uid} — skipping`);
    return;
  }

  const messages: ExpoPushMessage[] = tokens.map((to) => ({
    to,
    sound: 'default',
    title,
    body,
    data,
    priority: 'high',
    channelId: 'default', // must match mobile-registered channel
  }));

  for (const chunk of expo.chunkPushNotifications(messages)) {
    try {
      const tickets = await expo.sendPushNotificationsAsync(chunk);
      tickets.forEach((ticket, i) => {
        if (ticket.status === 'ok') {
          logger.info(`[push] Ticket ok for ${tokens[i]}`);
        } else {
          const err =
            typeof ticket.details === 'object' && ticket.details !== null
              ? (ticket.details as { error?: string }).error
              : undefined;
          logger.error(`[push] Ticket error for ${tokens[i]}: ${err ?? ticket.message}`);
          // Future token-hygiene step: delete docs for DeviceNotRegistered.
        }
      });
    } catch (error) {
      logger.error('[push] Failed sending chunk:', error);
    }
  }
}

/** Idempotent in-app notification doc (retry-safe deterministic ID). */
async function writeInAppNotification(
  deterministicId: string,
  input: {
    userId: string;
    title: string;
    body: string;
    type: 'message' | 'appointment';
    relatedId: string;
    data?: Record<string, unknown>;
  },
): Promise<void> {
  await db.doc(`${COLL.notifications}/${deterministicId}`).set({
    userId: input.userId,
    title: input.title,
    body: input.body,
    type: input.type,
    isRead: false,
    relatedId: input.relatedId,
    ...(input.data ? { data: input.data } : {}),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Trigger 1: new message document → notify all other conversation participants
// Replicates MessagingService.sendMessagePushNotification (client) exactly.
// ─────────────────────────────────────────────────────────────────────────────
export const onMessageCreated = onDocumentCreated(
  'messages/{messageId}',
  async (event) => {
    const snap = event.data;
    if (!snap) {
      logger.warn('[message] Event carried no snapshot — ignoring');
      return;
    }

    const message = snap.data() as {
      conversationId?: string;
      senderId?: string;
      body?: string;
    };
    const { messageId } = event.params;

    if (!message.conversationId || !message.senderId || !message.body) {
      logger.warn(`[message] ${messageId}: missing required fields — ignoring`);
      return;
    }

    // Resolve sender display name + authoritative recipient list.
    const [sender, convSnap] = await Promise.all([
      getUserBrief(message.senderId),
      db.collection(COLL.conversations).doc(message.conversationId).get(),
    ]);

    if (!convSnap.exists) {
      logger.warn(
        `[message] ${messageId}: conversation ${message.conversationId} vanished — ignoring`,
      );
      return;
    }

    const participantIds =
      (convSnap.data()?.participantIds as string[] | undefined) ?? [];
    const recipients = participantIds.filter((id) => id !== message.senderId);

    if (!recipients.length) {
      logger.info(`[message] ${messageId}: no other participants`);
      return;
    }

    const senderName = sender?.displayName ?? 'New Message';
    const pushBody = truncateBody(message.body);

    logger.info(
      `[message] ${messageId}: notifying ${recipients.length} recipient(s), ` +
        `title="${senderName}", body="${pushBody}"`,
    );

    await Promise.allSettled(
      recipients.map(async (uid) => {
        const recipient = await getUserBrief(uid);
        const prefix = deepLinkPrefixForRole(recipient?.role);
        const url = `spartan-g://${prefix}/conversation/${message.conversationId}`;

        await Promise.allSettled([
          writeInAppNotification(`notif_msg_${messageId}_${uid}`, {
            userId: uid,
            title: senderName,
            body: pushBody,
            type: 'message',
            relatedId: message.conversationId!,
            data: { url },
          }),
          pushToUser(uid, senderName, pushBody, { url }),
        ]);
      }),
    );
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Trigger 2: new appointment document → notify the facilitator
// Replicates AppointmentService.requestAppointment notification block (client).
// ─────────────────────────────────────────────────────────────────────────────
export const onAppointmentCreated = onDocumentCreated(
  'appointments/{appointmentId}',
  async (event) => {
    const snap = event.data;
    if (!snap) {
      logger.warn('[appointment] Event carried no snapshot — ignoring');
      return;
    }

    const appointment = snap.data() as {
      status?: string;
      facilitatorId?: string;
      scheduledAt?: { toDate?: () => Date };
    };
    const { appointmentId } = event.params;

    // Only newly REQUESTED appointments notify. If this collection ever gains
    // other onCreate producers, this guard keeps behavior identical to client.
    if (appointment.status && appointment.status !== 'requested') {
      logger.info(
        `[appointment] ${appointmentId}: status=${appointment.status} — no push`,
      );
      return;
    }

    const facilitatorUid = appointment.facilitatorId;
    if (!facilitatorUid) {
      logger.warn(`[appointment] ${appointmentId}: missing facilitatorId`);
      return;
    }

    // Timezone note (documented divergence): the client used the SENDER's
    // device locale via toLocaleString(); the server formats in Asia/Manila
    // for consistency across senders (campus context).
    const when = appointment.scheduledAt?.toDate?.();
    const formattedWhen = when
      ? new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila' }).format(when)
      : 'the requested time';

    const title = 'New Appointment Request';
    const body = `A student has requested an appointment at ${formattedWhen}.`;
    const url = 'spartan-g://facilitator/appointments';

    logger.info(
      `[appointment] ${appointmentId}: notifying facilitator ${facilitatorUid}`,
    );

    await Promise.allSettled([
      writeInAppNotification(`notif_apt_${appointmentId}_${facilitatorUid}`, {
        userId: facilitatorUid,
        title,
        body,
        type: 'appointment',
        relatedId: appointmentId,
        data: { url },
      }),
      pushToUser(facilitatorUid, title, body, {
        url,
        appointmentId,
      }),
    ]);
  },
);