import * as admin from 'firebase-admin';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';

admin.initializeApp();

export const onMessageCreate = onDocumentCreated('messages/{messageId}', async (event: any) => {
  const message = event.data?.data();
  if (!message) {
    return;
  }

  const { conversationId, senderId, body } = message as {
    conversationId?: string;
    senderId?: string;
    body?: string;
  };

  if (!conversationId || !senderId || !body) {
    return;
  }

  const firestore = admin.firestore();
  const conversationSnapshot = await firestore.doc(`conversations/${conversationId}`).get();
  const conversation = conversationSnapshot.data();

  if (!conversation?.participantIds || !Array.isArray(conversation.participantIds)) {
    return;
  }

  const recipientIds = conversation.participantIds.filter((participantId: string) => participantId !== senderId);
  if (recipientIds.length === 0) {
    return;
  }

  const senderSnapshot = await firestore.doc(`users/${senderId}`).get();
  const senderName = senderSnapshot.data()?.displayName || 'Someone';
  const preview = body.slice(0, 100);

  for (const recipientId of recipientIds) {
    const tokenSnapshot = await firestore.collection('device_tokens').where('uid', '==', recipientId).get();
    const tokens = tokenSnapshot.docs.map((doc: any) => doc.data().token).filter(Boolean);

    if (tokens.length === 0) {
      continue;
    }

    await admin.messaging().sendEachForMulticast({
      tokens,
      notification: {
        title: senderName,
        body: preview,
      },
      data: {
        conversationId,
        senderId,
        type: 'new_message',
      },
    });
  }

  await firestore.doc(`conversations/${conversationId}`).update({
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
});
