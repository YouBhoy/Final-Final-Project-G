import { request as httpsRequest } from 'node:https';
import type { ClientRequest } from 'node:http';
import type { PushStore } from '../../services/student-support/notification-runtime';
import { parsePushEnvelope, PUSH_CHANNELS, safePushContent } from '../../packages/shared-services/src/notifications/push-contract';
import { PROJECT } from './isolation';

export type PreparedFcmMessage = {
  token: string; data: Record<string, string>; notification?: { title: string; body: string };
  android: { ttl: number; priority?: 'normal' | 'high'; notification?: { channelId: string; visibility: 'private' } };
};
export type SendAttempt = { id: string; uid: string; kind: 'proof' | 'visible'; authorize(): Promise<boolean> };
export type Outcome = 'not-sent' | 'rejected' | 'unknown' | 'accepted';
type Result = { outcome: Outcome; httpStatus?: number; invalidToken?: boolean };

/** No raw provider error text, token, proof or credential is attached to an error. */
export class NotificationTransportError extends Error {
  readonly code?: string;
  constructor(readonly outcome: Outcome, invalidToken = false) {
    super('Notification transport ' + outcome);
    if (invalidToken) this.code = 'messaging/registration-token-not-registered';
  }
}

/** Explicit REST mapping, not Admin's hidden/retrying HTTP client. Android staging only. */
export function fcmRestBody(message: PreparedFcmMessage, kind: SendAttempt['kind'], now: number) {
  if (!/^[A-Za-z0-9_:\-]{32,4096}$/.test(message.token) || !Number.isSafeInteger(message.android.ttl)
    || message.android.ttl <= 0 || message.android.ttl > 3600000) throw Error('Invalid FCM preparation');
  if (kind === 'proof') {
    if (message.notification || message.android.notification || message.android.priority !== 'normal'
      || Object.keys(message.android).sort().join(',') !== 'priority,ttl'
      || Object.keys(message.data).sort().join(',') !== 'challengeId,proof,spartanRegistration' || message.data.spartanRegistration !== '1'
      || !/^[A-Za-z0-9_-]{32,128}$/.test(message.data.challengeId) || !/^[A-Za-z0-9_-]{32,128}$/.test(message.data.proof)) throw Error('Invalid proof preparation');
  } else {
    const envelope = parsePushEnvelope(JSON.parse(message.data.body), now);
    if (!envelope || Object.keys(message.data).sort().join(',') !== 'body,message,title'
      || Object.keys(message.android).sort().join(',') !== 'notification,priority,ttl'
      || Object.keys(message.notification ?? {}).sort().join(',') !== 'body,title'
      || Object.keys(message.android.notification ?? {}).sort().join(',') !== 'channelId,visibility'
      || message.data.title !== 'Spartan-G' || message.data.message !== message.notification?.body
      || !safePushContent({ ...message.notification, data: envelope }, now)
      || message.android.priority !== (envelope.category === 'assessment' || envelope.category === 'system' ? 'normal' : 'high') || message.android.notification?.visibility !== 'private'
      || message.android.notification.channelId !== PUSH_CHANNELS[envelope.category]) throw Error('Invalid visible preparation');
  }
  const body = { message: {
    token: message.token, data: message.data, ...(message.notification ? { notification: message.notification } : {}),
    android: { ttl: (message.android.ttl / 1000).toFixed(3) + 's', priority: message.android.priority === 'high' ? 'HIGH' : 'NORMAL',
      restricted_package_name: 'com.spartang.mobile.staging',
      ...(message.android.notification ? { notification: { channel_id: message.android.notification.channelId, visibility: 'PRIVATE' } } : {}) },
  } };
  const bytes = Buffer.from(JSON.stringify(body));
  if (bytes.length > 8192) throw Error('FCM preparation limit');
  return bytes;
}

/** One request, no redirects, no SDK send(), no connection retry or background resend. */
export function createStagingFcmSender(options: {
  project: string; store: PushStore; getAccessToken(): Promise<string>;
  reserveAttempt(uid: string, kind: 'proof' | 'visible', path: string): Promise<boolean>;
  allow(uid: string): Promise<boolean>;
  request?: typeof httpsRequest; deadlineMs?: number; now?: () => number;
}) {
  if (options.project !== PROJECT) throw Error('FCM staging project rejected');
  const request = options.request ?? httpsRequest, now = options.now ?? Date.now, deadlineMs = options.deadlineMs ?? 8000;
  if (!Number.isInteger(deadlineMs) || deadlineMs < 10 || deadlineMs > 8000) throw Error('FCM deadline rejected');
  return { async send(message: PreparedFcmMessage, attempt: SendAttempt, external?: AbortSignal) {
    if (!/^(proof|visible)_[A-Za-z0-9_-]{32,128}$/.test(attempt.id) || !attempt.id.startsWith(attempt.kind + '_') || !/^[A-Za-z0-9_-]{1,128}$/.test(attempt.uid)) throw new NotificationTransportError('not-sent');
    const path = 'notification_deliveries/attempt_' + attempt.id, controller = new AbortController(), signal = controller.signal;
    const abort = () => controller.abort(), deadline = performance.now() + deadlineMs, timer = setTimeout(abort, deadlineMs);
    external?.addEventListener('abort', abort, { once: true }); if (external?.aborted) abort();
    let reserved = false, submitted = false, req: ClientRequest | undefined, result: Result = { outcome: 'not-sent' };
    const check = () => { if (performance.now() >= deadline) abort(); if (signal.aborted) throw new NotificationTransportError(submitted ? 'unknown' : 'not-sent'); };
    // Aborting does not prove that an underlying credential or Firestore call stopped.
    // A late completion is ignored and cannot resume the send continuation.
    async function bounded<T>(work: () => Promise<T>): Promise<T> {
      check(); let cancel!: () => void;
      try { return await Promise.race([work(), new Promise<never>((_, reject) => { cancel = () => reject(new NotificationTransportError(submitted ? 'unknown' : 'not-sent')); signal.addEventListener('abort', cancel, { once: true }); if (signal.aborted) cancel(); })]); }
      finally { signal.removeEventListener('abort', cancel); }
    }
    try {
      const bytes = fcmRestBody(message, attempt.kind, now()); check();
      if (!await bounded(() => options.reserveAttempt(attempt.uid, attempt.kind, path))) throw Error('Attempt unavailable');
      reserved = true;
      const accessToken = await bounded(options.getAccessToken);
      if (typeof accessToken !== 'string' || !/^[\x21-\x7e]{16,8192}$/.test(accessToken)) throw Error('Invalid access token');
      if (!await bounded(attempt.authorize) || !await bounded(() => options.allow(attempt.uid))) throw Error('Attempt cancelled'); check();
      result = await new Promise<Result>(resolve => {
        let settled = false;
        const finish = (value: Result) => { if (settled) return; settled = true; signal.removeEventListener('abort', cancel); resolve(value); };
        const cancel = () => { finish({ outcome: submitted ? 'unknown' : 'not-sent' }); req?.destroy(); };
        signal.addEventListener('abort', cancel, { once: true });
        try {
          check();
          req = request({ protocol: 'https:', hostname: 'fcm.googleapis.com', port: 443,
            path: '/v1/projects/' + PROJECT + '/messages:send', method: 'POST', agent: false, signal,
            headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json', 'Content-Length': bytes.length } }, response => {
            const chunks: Buffer[] = []; let size = 0;
            response.on('data', (chunk: Buffer) => { size += chunk.length; if (size > 16384) { finish({ outcome: 'unknown' }); response.destroy(); req?.destroy(); } else chunks.push(chunk); });
            response.once('error', () => finish({ outcome: 'unknown' }));
            response.once('aborted', () => finish({ outcome: 'unknown' }));
            response.once('end', () => {
              const httpStatus = response.statusCode;
              try {
                const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
                if (httpStatus === 200 && typeof body.name === 'string' && /^projects\/spartan-g-assessment-staging\/messages\/[A-Za-z0-9%_:.-]+$/.test(body.name)) finish({ outcome: 'accepted', httpStatus });
                else if (httpStatus && httpStatus >= 400 && httpStatus < 500 && body.error?.code === httpStatus && typeof body.error.status === 'string') {
                  const invalidToken = httpStatus === 404 && Array.isArray(body.error.details) && body.error.details.some((d: any) => d['@type'] === 'type.googleapis.com/google.firebase.fcm.v1.FcmError' && d.errorCode === 'UNREGISTERED');
                  finish({ outcome: 'rejected', httpStatus, invalidToken });
                } else finish({ outcome: 'unknown', ...(httpStatus ? { httpStatus } : {}) });
              } catch { finish({ outcome: 'unknown', ...(httpStatus ? { httpStatus } : {}) }); }
            });
          });
          req.once('error', () => finish({ outcome: submitted ? 'unknown' : 'not-sent' }));
          check(); submitted = true; req.end(bytes);
        } catch { finish({ outcome: submitted ? 'unknown' : 'not-sent' }); req?.destroy(); }
      });
    } catch { result = { outcome: submitted ? 'unknown' : 'not-sent' }; }
    finally { clearTimeout(timer); external?.removeEventListener('abort', abort); }
    if (reserved) {
      // Bounded evidence persistence. A crash/failed update leaves prepared = unknown, never retryable.
      let evidenceTimer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([options.store.transaction(async tx => { const row = await tx.get(path); if (row?.outcome === 'prepared') tx.set(path, { ...row, outcome: result.outcome, ...(result.httpStatus ? { httpStatus: result.httpStatus } : {}), finishedAt: now() }); }),
          new Promise<never>((_, reject) => { evidenceTimer = setTimeout(() => reject(Error('Evidence unavailable')), 1000); })]);
      } catch { throw new NotificationTransportError('unknown'); }
      finally { clearTimeout(evidenceTimer); }
    }
    if (result.outcome !== 'accepted') throw new NotificationTransportError(result.outcome, result.invalidToken);
  } };
}
