import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import React from 'react';
import Renderer, { act } from 'react-test-renderer';

const moduleUrl = code => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
const transpile = source => ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX,
} }).outputText;
const sessionCode = transpile(await readFile(new URL('../src/lib/privacySession.ts', import.meta.url), 'utf8'));
const sessionUrl = moduleUrl(sessionCode);
const session = await import(sessionUrl);
const fixtureUrl = moduleUrl(`
export function useAuth() { return globalThis.__privacyTest.context; }
export const auth = { get currentUser() { return globalThis.__privacyTest.firebaseUser; } };
export function loadPrivacyPolicy() { return globalThis.__privacyTest.load(); }
`);
let code = transpile(await readFile(new URL('../src/components/auth/PrivacyConsentGate.tsx', import.meta.url), 'utf8'));
code = code.replace(/(['"])react\1/g, JSON.stringify(import.meta.resolve('react')))
  .replace(/(['"])react\/jsx-runtime\1/g, JSON.stringify(import.meta.resolve('react/jsx-runtime')))
  .replace(/(['"])\.\.\/\.\.\/hooks\/useAuth\1/g, JSON.stringify(fixtureUrl))
  .replace(/(['"])\.\.\/\.\.\/firebase\/firebase\1/g, JSON.stringify(fixtureUrl))
  .replace(/(['"])\.\.\/\.\.\/lib\/privacyPolicy\1/g, JSON.stringify(fixtureUrl))
  .replace(/(['"])\.\.\/\.\.\/lib\/privacySession\1/g, JSON.stringify(sessionUrl));
const { PrivacyConsentGate } = await import(moduleUrl(code));
const roots = [];
const originalStorage = globalThis.sessionStorage;
afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  if (originalStorage === undefined) delete globalThis.sessionStorage;
  else globalThis.sessionStorage = originalStorage;
  delete globalThis.__privacyTest;
});

function setup(role = 'student') {
  const values = new Map();
  globalThis.sessionStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const fixture = { mounts: 0, logouts: 0, loads: 0, firebaseUser: { metadata: { lastSignInTime: 'login-one' } },
    context: { user: { uid: 'person', role }, logout: async () => {
      fixture.logouts++; session.clearPrivacySession(); fixture.context.user = null; fixture.firebaseUser = null;
      fixture.root.update(React.createElement(App));
    } }, load: async () => { fixture.loads++; return { title: 'Institution Privacy', body: 'Current policy body', version: 1 }; } };
  globalThis.__privacyTest = fixture;
  function Portal() { fixture.mounts++; return React.createElement('p', null, 'Private portal'); }
  function App() { return React.createElement(PrivacyConsentGate, { background: fixture.background },
    fixture.context.user ? React.createElement(Portal) : React.createElement('p', null, 'Login')); }
  fixture.App = App;
  fixture.render = async () => { await act(async () => {
    fixture.root = Renderer.create(React.createElement(App)); roots.push(fixture.root);
  }); };
  fixture.button = label => fixture.root.root.findAllByType('button').find(button => button.children.join('') === label);
  return fixture;
}

test('student and facilitator login/signup sessions cannot mount portal before Accept', async () => {
  for (const role of ['student', 'facilitator']) {
    const fixture = setup(role);
    await fixture.render();
    assert.equal(fixture.mounts, 0);
    assert.equal(fixture.root.root.findByProps({ role: 'dialog' }).props['aria-modal'], 'true');
    assert.ok(JSON.stringify(fixture.root.toJSON()).includes('SPARTAN-G is not a medical or diagnostic tool.'));
    assert.equal(fixture.button('I Agree').props.disabled, true);
    await act(async () => fixture.root.root.findByType('input').props.onChange({ target: { checked: true } }));
  await act(async () => fixture.button('I Agree').props.onClick());
    assert.equal(fixture.mounts, 1);
    assert.equal(session.readPrivacySession(), 'person:login-one');
    act(() => fixture.root.unmount());
  }
});

test('agreement checkbox is required, can be unchecked, and resets for a new login', async () => {
  const fixture = setup(); await fixture.render();
  assert.equal(fixture.button('I Agree').props.disabled, true);
  await act(async () => fixture.button('I Agree').props.onClick());
  assert.equal(fixture.mounts, 0);
  await act(async () => fixture.root.root.findByType('input').props.onChange({ target: { checked: true } }));
  assert.equal(fixture.button('I Agree').props.disabled, false);
  await act(async () => fixture.root.root.findByType('input').props.onChange({ target: { checked: false } }));
  assert.equal(fixture.button('I Agree').props.disabled, true);
  await act(async () => fixture.root.root.findByType('input').props.onChange({ target: { checked: true } }));
  await act(async () => fixture.button('I Agree').props.onClick());
  fixture.firebaseUser.metadata.lastSignInTime = 'next-login';
  await act(async () => fixture.root.update(React.createElement(fixture.App)));
  assert.equal(fixture.root.root.findByType('input').props.checked, false);
  assert.equal(fixture.button('I Agree').props.disabled, true);
});

test('policy link opens its own popup and closing returns without accepting or signing out', async () => {
  const fixture = setup(); await fixture.render();
  const link = fixture.root.root.findByType('a');
  assert.equal(link.props.href, '#privacy-policy-body');
  let prevented = false;
  await act(async () => link.props.onClick({ preventDefault() { prevented = true; } }));
  assert.equal(prevented, true);
  assert.equal(fixture.root.root.findByProps({ id: 'privacy-policy-body' }).props.role, 'region');
  assert.ok(JSON.stringify(fixture.root.toJSON()).includes('Current policy body'));
  assert.equal(fixture.root.root.findAllByProps({ role: 'dialog' }).length, 1);
  await act(async () => fixture.button('Back to agreement').props.onClick());
  assert.equal(fixture.root.root.findByType('input').props.checked, false);
  assert.equal(fixture.mounts, 0);
  assert.equal(fixture.logouts, 0);
  assert.ok(JSON.stringify(fixture.root.toJSON()).includes('SPARTAN-G is not a medical or diagnostic tool.'));
});

test('Deny signs out without ever mounting portal', async () => {
  const fixture = setup(); await fixture.render();
  await act(async () => fixture.button('Deny').props.onClick());
  assert.equal(fixture.logouts, 1);
  assert.equal(fixture.context.user, null);
  assert.equal(fixture.mounts, 0);
  assert.ok(JSON.stringify(fixture.root.toJSON()).includes('Login'));
});

test('closing the dialog also denies and signs out', async () => {
  const fixture = setup('facilitator'); await fixture.render();
  await act(async () => fixture.root.root.findByProps({ 'aria-label': 'Deny privacy policy and sign out' }).props.onClick());
  assert.equal(fixture.logouts, 1); assert.equal(fixture.mounts, 0);
});

test('super admins enter without the popup or a policy request', async () => {
  const fixture = setup('super_admin'); await fixture.render();
  assert.equal(fixture.mounts, 1); assert.equal(fixture.loads, 0);
});

test('refresh retains consent for the same sign-in, but another sign-in prompts again', async () => {
  const fixture = setup(); await fixture.render();
  await act(async () => fixture.root.root.findByType('input').props.onChange({ target: { checked: true } }));
  await act(async () => fixture.button('I Agree').props.onClick());
  act(() => fixture.root.unmount());
  await fixture.render();
  assert.equal(fixture.root.root.findAllByProps({ role: 'dialog' }).length, 0);
  fixture.firebaseUser.metadata.lastSignInTime = 'login-two';
  fixture.load = async () => ({ title: 'Updated policy', body: 'New admin text', version: 2 });
  const before = fixture.mounts;
  await act(async () => fixture.root.update(React.createElement(fixture.App)));
  assert.equal(fixture.mounts, before);
  await act(async () => fixture.root.root.findByType('a').props.onClick({ preventDefault() {} }));
  assert.ok(JSON.stringify(fixture.root.toJSON()).includes('New admin text'));
});

test('policy load errors keep Accept disabled and allow retry or denial', async () => {
  const fixture = setup(); fixture.load = async () => { throw new Error('Network failure'); };
  await fixture.render();
  assert.equal(fixture.button('I Agree').props.disabled, true); assert.equal(fixture.mounts, 0);
  fixture.load = async () => ({ title: 'Recovered', body: 'Policy', version: 1 });
  await act(async () => fixture.button('Retry').props.onClick());
  assert.equal(fixture.button('I Agree').props.disabled, true);
  await act(async () => fixture.button('Deny').props.onClick());
  assert.equal(fixture.mounts, 0);
});

test('disabled session storage still allows acceptance in memory', async () => {
  const fixture = setup();
  globalThis.sessionStorage = { getItem() { throw new Error(); }, setItem() { throw new Error(); }, removeItem() { throw new Error(); } };
  await fixture.render();
  await act(async () => fixture.root.root.findByType('input').props.onChange({ target: { checked: true } }));
  await act(async () => fixture.button('I Agree').props.onClick());
  assert.equal(fixture.mounts, 1);
});

test('dashboard background is visible but inert while the requested portal route stays blocked', async () => {
  const fixture = setup();
  fixture.background = React.createElement('p', null, 'Student dashboard background');
  await fixture.render();
  const background = fixture.root.root.findByProps({ 'aria-hidden': 'true', inert: '' });
  assert.ok(JSON.stringify(background.toJSON?.() ?? fixture.root.toJSON()).includes('Student dashboard background'));
  assert.equal(fixture.mounts, 0);
  assert.ok(background.props.className.includes('pointer-events-none'));
  await act(async () => fixture.root.root.findByType('input').props.onChange({ target: { checked: true } }));
  await act(async () => fixture.button('I Agree').props.onClick());
  assert.equal(fixture.root.root.findAllByProps({ inert: '' }).length, 0);
  assert.equal(fixture.mounts, 1);
});

