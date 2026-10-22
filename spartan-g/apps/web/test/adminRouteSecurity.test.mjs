import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const moduleUrl = code => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
const fixtureUrl = moduleUrl('export function useAuth() { return globalThis.__adminRouteSession; }');
const source = await readFile(new URL('../src/components/auth/ProtectedRoute.tsx', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText
  .replace(/(['"])react\/jsx-runtime\1/g, JSON.stringify(import.meta.resolve('react/jsx-runtime')))
  .replace(/(['"])react-router-dom\1/g, JSON.stringify(import.meta.resolve('react-router-dom')))
  .replace(/(['"])\.\.\/\.\.\/hooks\/useAuth\1/g, JSON.stringify(fixtureUrl));
const { ProtectedRoute } = await import(moduleUrl(code));
let root;
afterEach(() => { if (root) act(() => root.unmount()); root = null; delete globalThis.__adminRouteSession; });
const paths = ['dashboard', 'users', 'users/synthetic-target', 'statistics', 'audit-logs', 'privacy', 'resources', 'campuses', 'settings'];
async function render(path, session, allowedRole = 'super_admin') {
  globalThis.__adminRouteSession = session;
  let mounts = 0;
  function PrivatePage() { mounts++; return React.createElement('p', null, 'PRIVATE ADMIN DATA'); }
  function App() {
    return React.createElement(MemoryRouter, { initialEntries: [path], future: { v7_startTransition: true, v7_relativeSplatPath: true } },
      React.createElement(Routes, null,
        React.createElement(Route, { path: allowedRole === 'super_admin' ? '/admin/*' : `/${allowedRole}/*`, element: React.createElement(ProtectedRoute, { allowedRoles: [allowedRole] }, React.createElement(PrivatePage)) }),
        ...['login', 'student/*', 'facilitator/*', 'admin/*'].filter(destination => !destination.startsWith(`${allowedRole === 'super_admin' ? 'admin' : allowedRole}/`)).map(destination => React.createElement(Route, { key: destination, path: `/${destination}`, element: React.createElement('p', null, destination) })),
      ));
  }
  await act(async () => { root = Renderer.create(React.createElement(App)); });
  return { mounts: () => mounts, update: async session => { globalThis.__adminRouteSession = session; await act(async () => root.update(React.createElement(App))); } };
}

test('all admin URLs reject anonymous, student and facilitator sessions before mounting private content', async () => {
  for (const path of paths) {
    for (const role of [null, 'student', 'facilitator']) {
      const app = await render(`/admin/${path}`, { status: role ? 'authenticated' : 'unauthenticated', user: role ? { uid: 'attacker', role } : null });
      assert.equal(app.mounts(), 0, `${role}: ${path}`);
      assert.ok(!JSON.stringify(root.toJSON()).includes('PRIVATE ADMIN DATA'));
      act(() => root.unmount()); root = null;
    }
  }
});

test('unresolved authentication and unknown roles never render admin content', async () => {
  for (const [status, role] of [['idle', 'super_admin'], ['loading', 'super_admin'], ['authenticated', 'owner']]) {
    const app = await render('/admin/users', { status, user: { uid: 'synthetic', role } });
    assert.equal(app.mounts(), 0);
    act(() => root.unmount()); root = null;
  }
});

test('valid admin access works and removing the session unmounts private data', async () => {
  const app = await render('/admin/dashboard', { status: 'authenticated', user: { uid: 'admin', role: 'super_admin' } });
  assert.equal(app.mounts(), 1);
  await app.update({ status: 'unauthenticated', user: null });
  assert.ok(!JSON.stringify(root.toJSON()).includes('PRIVATE ADMIN DATA'));
});

test('student and facilitator portals reject anonymous users and the other portal role', async () => {
  for (const portal of ['student', 'facilitator']) {
    for (const role of [null, portal === 'student' ? 'facilitator' : 'student']) {
      const app = await render(`/${portal}/dashboard`, { status: role ? 'authenticated' : 'unauthenticated', user: role ? { uid: 'attacker', role } : null }, portal);
      assert.equal(app.mounts(), 0);
      act(() => root.unmount()); root = null;
    }
    const app = await render(`/${portal}/dashboard`, { status: 'authenticated', user: { uid: 'member', role: portal } }, portal);
    assert.equal(app.mounts(), 1);
    act(() => root.unmount()); root = null;
  }
});
