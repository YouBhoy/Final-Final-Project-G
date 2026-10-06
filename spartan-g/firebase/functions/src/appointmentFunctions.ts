import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { bookAppointment } from './appointmentBooking.js';

if (!getApps().length) initializeApp();

export const requestAppointment = onCall({ region: 'us-central1', cors: true }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  return bookAppointment(getFirestore(), request.auth.uid, { ...request.data, appointmentId: undefined });
});

export const rescheduleAppointment = onCall({ region: 'us-central1', cors: true }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  if (!request.data?.appointmentId) throw new HttpsError('invalid-argument', 'An appointment id is required.');
  return bookAppointment(getFirestore(), request.auth.uid, request.data);
});
