import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import React from 'react';
import Renderer, { act } from 'react-test-renderer';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const url = code => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
const reactImports = code => code.replace(/(['"])react\1/g, JSON.stringify(import.meta.resolve('react'))).replace(/(['"])react\/jsx-runtime\1/g, JSON.stringify(import.meta.resolve('react/jsx-runtime')));

const libUrl = url(compile(read('../src/lib/messageStatus.ts')));
const lib = await import(libUrl);

const NOW = new Date(2026, 10, 7, 15, 0); // Nov 7, 2026, local time
const at = (m, d, h = 12, min = 0) => new Date(2026, m, d, h, min);
const msg = (id, senderId, createdAt, extra = {}) => ({ id, senderId, body: id, createdAt, ...extra });

test('status resolves from the stored field and falls back to readBy for legacy messages', () => {
  assert.equal(lib.resolveDeliveryStatus({ status: 'sent' }), 'sent');
  assert.equal(lib.resolveDeliveryStatus({ status: 'delivered' }), 'delivered');
  assert.equal(lib.resolveDeliveryStatus({ status: 'read' }), 'read');
  assert.equal(lib.resolveDeliveryStatus({ senderId: 'me', readBy: ['me'] }), 'sent');
  assert.equal(lib.resolveDeliveryStatus({ senderId: 'me', readBy: ['me', 'them'] }), 'read');
  // Client-only values are never trusted from storage.
  assert.equal(lib.resolveDeliveryStatus({ status: 'sending', senderId: 'me', readBy: ['me'] }), 'sent');
});

test('chat list status is only shown for my own last message', () => {
  const base = { participantIds: ['me', 'them'], lastMessageSenderId: 'me', unreadCount: { them: 1 } };
  assert.equal(lib.resolveConversationStatus({ ...base, lastMessageStatus: 'delivered' }, 'me'), 'delivered');
  assert.equal(lib.resolveConversationStatus({ ...base }, 'me'), 'sent');
  assert.equal(lib.resolveConversationStatus({ ...base, unreadCount: { them: 0 } }, 'me'), 'read');
  assert.equal(lib.resolveConversationStatus({ ...base, lastMessageSenderId: 'them' }, 'me'), null);
});

test('status labels match the spec', () => {
  assert.equal(lib.statusText('sent'), 'Sent');
  assert.equal(lib.statusText('delivered'), 'Delivered');
  assert.equal(lib.statusText('read'), 'Read');
  assert.equal(lib.statusText('read', at(10, 7, 21, 5)), 'Read · 9:05 PM');
  assert.equal(lib.statusText('failed'), 'Not sent');
});

test('messages are sorted oldest first even when delivered out of order', () => {
  const items = lib.buildThreadItems([
    msg('c', 'them', at(10, 5, 13, 15)),
    msg('a', 'me', at(10, 4, 16, 47)),
    msg('d', 'them', null), // server timestamp still pending: goes last
    msg('b', 'me', at(10, 4, 16, 47)), // same time as "a": id breaks the tie
  ], [], 'me', NOW);
  assert.deepEqual(items.filter(i => i.kind === 'message').map(i => i.message.id), ['a', 'b', 'c', 'd']);
});

test('date separators say Today, Yesterday, or the full date', () => {
  const items = lib.buildThreadItems([
    msg('old', 'them', at(10, 4)),
    msg('also-old', 'me', at(10, 4, 18)),
    msg('yesterday', 'them', at(10, 6)),
    msg('today', 'me', at(10, 7, 9)),
  ], [], 'me', NOW);
  assert.deepEqual(items.filter(i => i.kind === 'separator').map(i => i.label), ['Nov 4, 2026', 'Yesterday', 'Today']);
  assert.deepEqual(items.map(i => i.kind), ['separator', 'message', 'message', 'separator', 'message', 'separator', 'message']);
});

test('only the newest own message gets the label, and received messages get no status', () => {
  const items = lib.buildThreadItems([
    msg('1', 'me', at(10, 7, 9), { status: 'read' }),
    msg('2', 'them', at(10, 7, 10)),
    msg('3', 'me', at(10, 7, 11), { status: 'delivered' }),
    msg('4', 'them', at(10, 7, 12)),
  ], [], 'me', NOW).filter(i => i.kind === 'message');
  assert.deepEqual(items.map(i => i.isLastOwn), [false, false, true, false]);
  assert.deepEqual(items.map(i => i.status), ['read', null, 'delivered', null]);
});

test('pending messages sit at the end, show sending/failed, and are replaced by the real message', () => {
  const server = [msg('s1', 'them', at(10, 7, 10))];
  const pending = [
    { tempId: 'p1', body: 'one', state: 'sending', createdAtMs: at(10, 7, 14).getTime() },
    { tempId: 'p2', body: 'two', state: 'failed', createdAtMs: at(10, 7, 14, 1).getTime() },
    { tempId: 'p3', body: 'three', state: 'sending', serverId: 's3', createdAtMs: at(10, 7, 14, 2).getTime() },
  ];
  let items = lib.buildThreadItems(server, pending, 'me', NOW).filter(i => i.kind === 'message');
  assert.deepEqual(items.map(i => [i.message.body, i.status]), [['s1', null], ['one', 'sending'], ['two', 'failed'], ['three', 'sent']]);
  assert.equal(items[3].isLastOwn, true);
  // The server message for p3 arrives: the pending copy disappears and the key stays the same.
  items = lib.buildThreadItems([...server, msg('s3', 'me', at(10, 7, 14, 2), { status: 'sent' })], pending, 'me', NOW).filter(i => i.kind === 'message');
  assert.deepEqual(items.map(i => i.message.id), ['s1', 's3', 'p1', 'p2']);
  assert.equal(items.filter(i => i.message.id === 's3').length, 1);
});

// ---- MessageThread behaviour: optimistic send, failure + retry, read only while visible ----
const fixtureUrl = url(`
import React from ${JSON.stringify(import.meta.resolve('react'))};
export const state = { user: { uid: 'me', role: 'facilitator' }, snapshot: null, sends: [], failNext: false, reads: [], conversationReads: 0 };
export const useAuth = () => ({ user: state.user });
export const Modal = () => null;
export const MessageBubble = ({ message, status, showStatusLabel, onRetry }) =>
  React.createElement('div', { 'data-id': message.id, 'data-status': status ?? 'none', 'data-label': String(!!showStatusLabel), onClick: onRetry }, message.body);
export const DateSeparator = ({ label }) => React.createElement('hr', { 'data-label': label });
export const messagingService = {
  subscribeToMessages: (_c, _r, next) => { state.snapshot = next; next([]); return () => {}; },
  markConversationAsRead: async () => { state.conversationReads++; },
  markMessageAsRead: async (id) => { state.reads.push(id); },
  sendMessage: (...args) => { state.sends.push(args); return state.failNext ? Promise.reject(new Error('offline')) : Promise.resolve('server-' + state.sends.length); },
};
`);
const fixture = await import(fixtureUrl);
const hookCode = reactImports(compile(read('../src/hooks/useMessageIdentityConfirmation.tsx')))
  .replace(/from (['"])(?:\.\/useAuth|\.\.\/components\/ui\/Modal)\1/g, `from ${JSON.stringify(fixtureUrl)}`);
const inputUrl = url(reactImports(compile(read('../src/components/messaging/MessageInput.tsx'))));
const threadCode = reactImports(compile(read('../src/pages/messaging/MessageThread.tsx')))
  .replace(/(['"])\.\.\/\.\.\/hooks\/useMessageIdentityConfirmation\1/g, JSON.stringify(url(hookCode)))
  .replace(/(['"])\.\.\/\.\.\/components\/messaging\/MessageInput\1/g, JSON.stringify(inputUrl))
  .replace(/(['"])\.\.\/\.\.\/lib\/messageStatus\1/g, JSON.stringify(libUrl))
  .replace(/from (['"])(?:@spartan-g\/shared-services|\.\.\/\.\.\/hooks\/useAuth|\.\.\/\.\.\/components\/messaging\/MessageBubble|\.\.\/\.\.\/components\/messaging\/DateSeparator)\1/g, `from ${JSON.stringify(fixtureUrl)}`);
const { MessageThread } = await import(url(threadCode));

async function mount() {
  Object.assign(fixture.state, { sends: [], reads: [], conversationReads: 0, failNext: false });
  let root;
  await act(async () => { root = Renderer.create(React.createElement(MessageThread, { conversationId: 'c', participantId: 'them' })); });
  const bubbles = () => root.root.findAll(n => n.props['data-id'] !== undefined && typeof n.type === 'string');
  const send = async text => {
    await act(async () => { root.root.findByType('input').props.onChange({ target: { value: text } }); });
    await act(async () => { await root.root.findByType('form').props.onSubmit({ preventDefault() {} }); });
  };
  return { root, bubbles, send };
}

test('a sent message appears at once as sending, then sent, and the input never blocks', async () => {
  const f = await mount();
  try {
    let resolveSend;
    fixture.messagingService.sendMessage = (...args) => { fixture.state.sends.push(args); return new Promise(r => { resolveSend = r; }); };
    await f.send('first');
    assert.equal(f.bubbles()[0].props['data-status'], 'sending');
    // A second message can be typed and sent while the first is still in flight.
    await f.send('second');
    assert.equal(fixture.state.sends.length, 2);
    assert.deepEqual(f.bubbles().map(b => b.props['data-status']), ['sending', 'sending']);
    await act(async () => { resolveSend('server-2'); });
    assert.equal(f.bubbles()[1].props['data-status'], 'sent');
  } finally { act(() => f.root.unmount()); }
});

test('a failed send shows failed and retrying sends the same text again', async () => {
  const f = await mount();
  try {
    fixture.messagingService.sendMessage = (...args) => { fixture.state.sends.push(args); return fixture.state.failNext ? Promise.reject(new Error('offline')) : Promise.resolve('server-ok'); };
    fixture.state.failNext = true;
    await f.send('please retry');
    assert.equal(f.bubbles()[0].props['data-status'], 'failed');
    fixture.state.failNext = false;
    await act(async () => { await f.bubbles()[0].props.onClick(); });
    assert.equal(fixture.state.sends.length, 2);
    assert.equal(fixture.state.sends[1][2], 'please retry');
    assert.equal(f.bubbles()[0].props['data-status'], 'sent');
  } finally { act(() => f.root.unmount()); }
});

test('incoming messages are not marked read while the tab is hidden, and are once it is visible', async () => {
  const f = await mount();
  const incoming = [{ id: 'm1', senderId: 'them', body: 'hi', createdAt: new Date(2026, 10, 7, 9), readBy: ['them'] }];
  try {
    await act(async () => { fixture.state.snapshot(incoming); });
    assert.deepEqual(fixture.state.reads, ['m1']); // no `document` in node: treated as visible
  } finally { act(() => f.root.unmount()); }

  const listeners = {};
  const doc = { visibilityState: 'hidden', hasFocus: () => true, addEventListener: (n, fn) => { listeners[n] = fn; }, removeEventListener() {} };
  const win = { addEventListener(n, fn) { listeners['w' + n] = fn; }, removeEventListener() {} };
  globalThis.document = doc; globalThis.window = win;
  try {
    const g = await mount();
    fixture.state.reads.length = 0; fixture.state.conversationReads = 0;
    await act(async () => { fixture.state.snapshot(incoming); });
    assert.deepEqual(fixture.state.reads, []);
    assert.equal(fixture.state.conversationReads, 0);
    doc.visibilityState = 'visible';
    await act(async () => { listeners.visibilitychange(); });
    assert.deepEqual(fixture.state.reads, ['m1']);
    assert.ok(fixture.state.conversationReads >= 1);
    act(() => g.root.unmount());
  } finally { delete globalThis.document; delete globalThis.window; }
});
