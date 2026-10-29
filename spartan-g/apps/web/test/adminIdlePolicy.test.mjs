import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import React from 'react';
import Renderer, { act } from 'react-test-renderer';

const source = ts.transpileModule(readFileSync(new URL('../src/lib/adminTabSession.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const { ADMIN_IDLE_MS, beginAdminTabSession, clearAdminTabSession, hasAdminTabSession, monitorAdminIdle, beginPortalTabSession } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const original = { window: globalThis.window, document: globalThis.document, sessionStorage: globalThis.sessionStorage, now: Date.now, setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout };
let cleanup;
let root;
afterEach(() => {
  if (root) act(() => root.unmount()); root = undefined;
  delete globalThis.__idleAuth;
  cleanup?.(); cleanup = undefined;
  Date.now = original.now;
  for (const key of ['window', 'document', 'sessionStorage', 'setTimeout', 'clearTimeout']) {
    if (original[key] === undefined) delete globalThis[key]; else globalThis[key] = original[key];
  }
});
function target() {
  const listeners = new Map();
  return { hidden: false,
    addEventListener(type, listener) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(listener); },
    removeEventListener(type, listener) { listeners.get(type)?.delete(listener); },
    emit(type, event = { isTrusted: true }) { for (const listener of [...(listeners.get(type) ?? [])]) listener(event); },
    listenerCount: () => [...listeners.values()].reduce((sum, list) => sum + list.size, 0),
  };
}
function setup() {
  let now = 1000000, id = 0, expirations = 0;
  const storage = new Map(), timers = new Map();
  globalThis.window = target(); globalThis.document = target();
  globalThis.sessionStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) };
  Date.now = () => now;
  globalThis.setTimeout = (callback, delay) => { timers.set(++id, { callback, due: now + delay }); return id; };
  globalThis.clearTimeout = timer => timers.delete(timer);
  const clock = {
    tick(ms) {
      const end = now + ms;
      for (;;) {
        const next = [...timers.entries()].sort((a, b) => a[1].due - b[1].due)[0];
        if (!next || next[1].due > end) break;
        now = next[1].due; timers.delete(next[0]); next[1].callback();
      }
      now = end;
    },
    jump(ms) { now += ms; },
    start() { cleanup = monitorAdminIdle('admin', () => expirations++); },
    get expirations() { return expirations; }, storage, timers,
  };
  beginAdminTabSession('admin');
  return clock;
}

test('admin signs out at 15 minutes, not before; expiry removes listeners and the tab grant', () => {
  const clock = setup(); clock.start();
  clock.tick(ADMIN_IDLE_MS - 1); assert.equal(clock.expirations, 0);
  clock.tick(1); assert.equal(clock.expirations, 1);
  assert.equal(hasAdminTabSession('admin'), false);
  assert.equal(window.listenerCount() + document.listenerCount(), 0);
});

test('trusted interaction extends an unexpired session', () => {
  const clock = setup(); clock.start();
  clock.tick(10 * 60000); window.emit('keydown');
  clock.tick(10 * 60000); assert.equal(clock.expirations, 0);
  clock.tick(5 * 60000); assert.equal(clock.expirations, 1);
});

test('synthetic events and merely focusing or unhiding the tab do not extend the deadline', () => {
  const clock = setup(); clock.start();
  clock.tick(10 * 60000);
  window.emit('pointermove', { isTrusted: false }); window.emit('focus'); document.emit('visibilitychange');
  clock.tick(5 * 60000); assert.equal(clock.expirations, 1);
});

test('resuming a sleeping/background tab checks elapsed time before accepting user activity', () => {
  for (const event of ['focus', 'pageshow', 'keydown']) {
    const clock = setup(); clock.start();
    clock.jump(ADMIN_IDLE_MS + 1); window.emit(event);
    assert.equal(clock.expirations, 1, event);
    cleanup(); cleanup = undefined;
  }
});

test('page refresh preserves the original inactivity deadline', () => {
  const clock = setup(); clock.start();
  clock.tick(14 * 60000); cleanup(); clock.start();
  clock.tick(60000); assert.equal(clock.expirations, 1);
});

test('a separate tab, a different account and malformed storage do not inherit an admin grant', () => {
  const clock = setup();
  assert.equal(hasAdminTabSession('other-account'), false);
  clock.storage.clear(); assert.equal(hasAdminTabSession('admin'), false);
  clock.start(); assert.equal(clock.expirations, 1);
});

test('disabled browser storage fails closed on login and while a session is active', () => {
  const clock = setup(); clock.start();
  globalThis.sessionStorage.setItem = () => { throw new Error('Storage disabled'); };
  assert.throws(() => beginAdminTabSession('admin'), /tab storage/);
  clock.tick(1000); window.emit('pointermove');
  assert.equal(clock.expirations, 1);
});

test('unmounting the monitor removes timers and never signs out a later account', () => {
  const clock = setup(); clock.start(); cleanup();
  clock.tick(2 * ADMIN_IDLE_MS);
  assert.equal(clock.expirations, 0); assert.equal(clock.timers.size, 0);
  assert.equal(window.listenerCount() + document.listenerCount(), 0);
  clearAdminTabSession();
});

const moduleUrl = code => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
const boundaryUrl = moduleUrl(`
export function onAuthChange(listener) { globalThis.__idleAuth.listener = listener; return () => {}; }
export async function logoutUser() { globalThis.__idleAuth.signouts++; if (globalThis.__idleAuth.failLogout) throw new Error('SDK signout failed'); }
export function clearPrivacySession() {}
export async function loginUser() { throw new Error('Not used in this test'); }
export async function registerUser() { throw new Error('Not used in this test'); }
export async function resetPassword() {}
`);
const providerSource = ts.transpileModule(readFileSync(new URL('../src/hooks/useAuth.tsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText
  .replace(/(['"])react\1/g, JSON.stringify(import.meta.resolve('react')))
  .replace(/(['"])react\/jsx-runtime\1/g, JSON.stringify(import.meta.resolve('react/jsx-runtime')))
  .replace(/(['"])\.\.\/lib\/auth\1/g, JSON.stringify(boundaryUrl))
  .replace(/(['"])\.\.\/lib\/privacySession\1/g, JSON.stringify(boundaryUrl))
  .replace(/(['"])\.\.\/lib\/adminTabSession\1/g, JSON.stringify(moduleUrl(source)));
const { AuthProvider, useAuth } = await import(moduleUrl(providerSource));
function mountProvider(role, failLogout = false) {
  const clock = setup();
  beginPortalTabSession(role === 'super_admin' ? 'admin' : role);
  globalThis.__idleAuth = { signouts: 0, failLogout };
  let current;
  function Consumer() { current = useAuth(); return null; }
  act(() => { root = Renderer.create(React.createElement(AuthProvider, null, React.createElement(Consumer))); });
  act(() => globalThis.__idleAuth.listener({ uid: role === 'super_admin' ? 'admin' : role, role }));
  return { clock, session: () => current };
}

test('AuthProvider removes the admin portal session at expiry and reports why sign-in is required', () => {
  const app = mountProvider('super_admin');
  assert.equal(app.session().status, 'authenticated');
  act(() => app.clock.tick(ADMIN_IDLE_MS));
  assert.equal(app.session().user, null);
  assert.equal(app.session().status, 'unauthenticated');
  assert.match(app.session().error, /15 minutes of inactivity/);
  assert.equal(globalThis.__idleAuth.signouts, 1);
});

test('an SDK sign-out failure cannot reopen the admin session after idle expiry', async () => {
  const app = mountProvider('super_admin', true);
  await act(async () => app.clock.tick(ADMIN_IDLE_MS));
  assert.equal(app.session().user, null);
  assert.equal(app.session().status, 'unauthenticated');
  assert.equal(hasAdminTabSession('admin'), false);
});

test('student and facilitator sessions expire after 15 idle minutes, even if SDK signout fails', async () => {
  for (const role of ['student', 'facilitator']) {
    const app = mountProvider(role, true);
    act(() => app.clock.tick(ADMIN_IDLE_MS - 1));
    assert.equal(app.session().user.role, role);
    await act(async () => app.clock.tick(1));
    assert.equal(app.session().user, null);
    assert.equal(app.session().status, 'unauthenticated');
    assert.match(app.session().error, /15 minutes of inactivity/);
    assert.equal(globalThis.__idleAuth.signouts, 1);
    act(() => root.unmount()); root = undefined;
  }
});
