const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const vm = require('node:vm');
const { test } = require('node:test');

const root = path.resolve(__dirname, '../../..');
const ts = createRequire(path.join(root, 'apps/mobile/package.json'))('typescript');

// Run the actual repositories/services with a closed set of in-memory imports.
// No Firebase SDK initialization, network access, or cloud writes are possible.
function loadTs(relativePath, imports = {}) {
  const filename = path.join(root, relativePath);
  const source = fs.readFileSync(filename, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: filename,
  });
  const module = { exports: {} };
  const evaluate = vm.runInThisContext(`(function(require, module, exports) {\n${outputText}\n})`, { filename });
  evaluate((name) => {
    assert.ok(Object.hasOwn(imports, name), `Unexpected runtime import: ${name}`);
    return imports[name];
  }, module, module.exports);
  return module.exports;
}

function harness(seed = {}) {
  const errors = loadTs('packages/shared-types/src/utils/errors.ts');
  const { COLLECTIONS } = loadTs('packages/shared-types/src/constants/collections.ts');
  const sharedTypes = {
    ...errors,
    COLLECTIONS,
    PERMISSIONS: { SEND_MESSAGES: 'send_messages', VIEW_RISK_ALERTS: 'view_risk_alerts' },
    hasPermission: () => true,
  };
  const documents = new Map(Object.entries(seed));
  const listeners = [];
  const writes = [];
  const timestamp = Object.freeze({ sentinel: 'serverTimestamp' });
  const db = Object.freeze({ testOnly: true });
  const snapshot = (ref) => ({
    id: ref.id,
    exists: () => documents.has(ref.path),
    data: () => documents.get(ref.path),
  });
  const firestore = {
    getFirestoreDb: () => db,
    collection: (_db, name) => ({ path: name }),
    doc: (parent, ...segments) => {
      const docPath = [parent.path, ...segments].filter(Boolean).join('/') + (segments.length ? '' : '/generated-message');
      return { path: docPath, id: docPath.split('/').at(-1) };
    },
    where: (...args) => ({ where: args }),
    orderBy: (...args) => ({ orderBy: args }),
    query: (collection, ...constraints) => ({ collection, constraints }),
    onSnapshot: (query, next, error) => {
      const listener = { query, next, error, stopped: false };
      listener.unsubscribe = () => { listener.stopped = true; };
      listeners.push(listener);
      return listener.unsubscribe;
    },
    getDoc: async (ref) => snapshot(ref),
    setDoc: async (ref, data) => { writes.push({ operation: 'setDoc', ref, data }); },
    updateDoc: async (ref, data) => { writes.push({ operation: 'updateDoc', ref, data }); },
    serverTimestamp: () => timestamp,
    runTransaction: async (_db, work) => work({
      get: async (ref) => snapshot(ref),
      set: (ref, data) => { writes.push({ operation: 'set', ref, data }); },
      update: (ref, data) => { writes.push({ operation: 'update', ref, data }); },
    }),
  };
  const common = { '@spartan-g/shared-types': sharedTypes, '../firebase/firestore': firestore };
  const { BaseRepository } = loadTs('packages/shared-services/src/repositories/base.repository.ts', common);
  const repositoryImports = { ...common, './base.repository': { BaseRepository } };
  const repositories = {};
  for (const name of ['message', 'conversation', 'notification', 'risk-alert']) {
    repositories[name] = loadTs(`packages/shared-services/src/repositories/${name}.repository.ts`, repositoryImports);
  }
  const { messagingService } = loadTs('packages/shared-services/src/services/messaging.service.ts', {
    ...common,
    '../repositories/message.repository': repositories.message,
    '../repositories/conversation.repository': repositories.conversation,
    '../repositories/notification.repository': repositories.notification,
    './push-notification.service': { pushNotificationService: { sendPushToRecipient: async () => {} } },
    './user.service': { userService: { getUser: async () => null } },
  });
  const { riskAlertService } = loadTs('packages/shared-services/src/services/risk-alert.service.ts', {
    ...common,
    '../repositories/risk-alert.repository': repositories['risk-alert'],
  });
  return {
    ...errors, BaseRepository, listeners, writes, timestamp, messagingService, riskAlertService,
    notificationRepository: repositories.notification.notificationRepository,
  };
}

function assertWrapped(error, cause, collection, RepositoryError) {
  assert.ok(error instanceof RepositoryError);
  assert.equal(error.name, 'RepositoryError');
  assert.equal(error.message, `Query subscription error on ${collection}`);
  assert.equal(error.code, 'repo/subscribe-query');
  assert.equal(error.cause, cause);
}

test('listener errors reach the optional handler once with the original cause', async () => {
  const h = harness();
  const received = [];
  new h.BaseRepository('messages').subscribeQuery([], () => assert.fail('Unexpected snapshot'), (error) => received.push(error));
  const cause = Object.assign(new Error('Denied'), { code: 'permission-denied' });
  await Promise.resolve().then(() => h.listeners[0].error(cause));
  assert.equal(received.length, 1);
  assertWrapped(received[0], cause, 'messages', h.RepositoryError);
});

for (const explicitUndefined of [false, true]) {
  test(`listener errors still throw without a handler (explicit undefined: ${explicitUndefined})`, async () => {
    const h = harness();
    const repository = new h.BaseRepository('conversations');
    if (explicitUndefined) repository.subscribeQuery([], () => {}, undefined);
    else repository.subscribeQuery([], () => {});
    const cause = new Error('Missing index');
    await assert.rejects(Promise.resolve().then(() => h.listeners[0].error(cause)), (error) => {
      assertWrapped(error, cause, 'conversations', h.RepositoryError);
      return true;
    });
  });
}

test('exceptions from a supplied error handler are not swallowed or rewrapped', () => {
  const h = harness();
  const handlerFailure = new Error('Handler failed');
  new h.BaseRepository('messages').subscribeQuery([], () => {}, () => { throw handlerFailure; });
  assert.throws(() => h.listeners[0].error(new Error('Denied')), (error) => error === handlerFailure);
});

test('query subscriptions preserve constraints, hydrated IDs, and unsubscribe', () => {
  const h = harness();
  const constraints = [{ field: 'conversationId' }, { field: 'createdAt' }];
  let received;
  const unsubscribe = new h.BaseRepository('messages').subscribeQuery(constraints, (data) => { received = data; });
  const listener = h.listeners[0];
  assert.deepEqual(listener.query.constraints, constraints);
  listener.next({ docs: [{ id: 'message-1', data: () => ({ body: 'Hello', attachmentUrl: null }) }] });
  assert.deepEqual(received, [{ id: 'message-1', body: 'Hello', attachmentUrl: null }]);
  assert.equal(unsubscribe, listener.unsubscribe);
  unsubscribe();
  assert.equal(listener.stopped, true);
});

for (const kind of ['messages', 'conversations']) {
  test(`messaging ${kind} subscriptions forward errors and retain their query`, () => {
    const h = harness();
    let received;
    const callback = (error) => { received = error; };
    const unsubscribe = kind === 'messages'
      ? h.messagingService.subscribeToMessages('conversation-1', 'student', () => {}, callback)
      : h.messagingService.subscribeToConversations('student-1', 'student', () => {}, callback);
    const listener = h.listeners[0];
    const expected = kind === 'messages'
      ? [{ where: ['conversationId', '==', 'conversation-1'] }, { orderBy: ['createdAt', 'asc'] }]
      : [{ where: ['participantIds', 'array-contains', 'student-1'] }, { orderBy: ['lastMessageAt', 'desc'] }];
    assert.deepEqual(listener.query.constraints, expected);
    const cause = new Error('Denied');
    listener.error(cause);
    assertWrapped(received, cause, kind, h.RepositoryError);
    assert.equal(unsubscribe, listener.unsubscribe);
  });

  test(`messaging ${kind} subscriptions retain the no-handler throw behavior`, () => {
    const h = harness();
    if (kind === 'messages') h.messagingService.subscribeToMessages('conversation-1', 'student', () => {});
    else h.messagingService.subscribeToConversations('student-1', 'student', () => {});
    const cause = new Error('Denied');
    assert.throws(() => h.listeners[0].error(cause), (error) => {
      assertWrapped(error, cause, kind, h.RepositoryError);
      return true;
    });
  });
}

test('notification subscriptions retain sorting, IDs, query, and error behavior', () => {
  const h = harness();
  let received;
  const unsubscribe = h.notificationRepository.subscribeByUserId('student-1', (data) => { received = data; });
  const listener = h.listeners[0];
  assert.deepEqual(listener.query.constraints, [{ where: ['userId', '==', 'student-1'] }]);
  listener.next({ docs: [
    { id: 'older', data: () => ({ createdAt: { toMillis: () => 1000 } }) },
    { id: 'newer', data: () => ({ created_at: '2026-01-01T00:00:00Z' }) },
  ] });
  assert.deepEqual(received.map((item) => item.id), ['newer', 'older']);
  const cause = new Error('Denied');
  assert.throws(() => listener.error(cause), (error) => {
    assertWrapped(error, cause, 'notifications', h.RepositoryError);
    return true;
  });
  unsubscribe();
  assert.equal(listener.stopped, true);
});

test('risk-alert subscriptions retain snapshots, query, and error behavior', () => {
  const h = harness();
  let received;
  const unsubscribe = h.riskAlertService.subscribeToAlerts('facilitator-1', 'facilitator', (data) => { received = data; });
  const listener = h.listeners[0];
  assert.deepEqual(listener.query.constraints, []);
  listener.next({ docs: [{ id: 'alert-1', data: () => ({ status: 'open' }) }] });
  assert.deepEqual(received, [{ id: 'alert-1', status: 'open' }]);
  const cause = new Error('Denied');
  assert.throws(() => listener.error(cause), (error) => {
    assertWrapped(error, cause, 'risk_alerts', h.RepositoryError);
    return true;
  });
  unsubscribe();
  assert.equal(listener.stopped, true);
});

for (const attachmentUrl of [undefined, 'https://example.test/attachment']) {
  test(`message writes retain their payload (attachment: ${Boolean(attachmentUrl)})`, async () => {
    const h = harness({ 'conversations/conversation-1': { participantIds: ['sender', 'recipient'], unreadCount: { recipient: 2 } } });
    await h.messagingService.sendMessage('conversation-1', 'sender', ' Hello ', 'student', attachmentUrl);
    const message = h.writes.find((write) => write.ref.path === 'messages/generated-message');
    assert.equal(message.operation, 'set');
    assert.deepEqual(message.data, {
      conversationId: 'conversation-1', senderId: 'sender', body: 'Hello',
      attachmentUrl: attachmentUrl || null, readBy: ['sender'], createdAt: h.timestamp, updatedAt: h.timestamp,
    });
    const conversation = h.writes.find((write) => write.ref.path === 'conversations/conversation-1');
    assert.deepEqual(conversation.data, {
      lastMessageAt: h.timestamp, lastMessagePreview: 'Hello', lastMessageId: 'generated-message',
      lastMessageSenderId: 'sender', lastMessageType: attachmentUrl ? 'attachment' : 'text', unreadCount: { recipient: 3 },
    });
  });
}

for (const readBy of [undefined, ['sender'], ['sender', 'recipient']]) {
  test(`receipt updates preserve existing operations (receipts: ${JSON.stringify(readBy)})`, async () => {
    const h = harness({
      'messages/message-1': { conversationId: 'conversation-1', ...(readBy ? { readBy } : { isRead: true }) },
      'conversations/conversation-1': { participantIds: ['sender', 'recipient'] },
    });
    await h.messagingService.markMessageAsRead('message-1', 'recipient', 'student');
    if (readBy?.includes('recipient')) {
      assert.deepEqual(h.writes, []);
    } else {
      assert.deepEqual(h.writes, [{
        operation: 'updateDoc', ref: { path: 'messages/message-1', id: 'message-1' },
        data: { readBy: [...(readBy || []), 'recipient'], updatedAt: h.timestamp },
      }]);
    }
  });
}
