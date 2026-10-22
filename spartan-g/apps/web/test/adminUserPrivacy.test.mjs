import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { MemoryRouter } from 'react-router-dom';

const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const url = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const policyUrl = url(compile(read('../src/lib/pseudonymization.ts')));
const policy = await import(policyUrl);
const rawStudent = { id: 'PRIVATE_UID', uid: 'PRIVATE_UID', displayName: 'PRIVATE_NAME', email: 'PRIVATE_EMAIL@example.com', role: 'student', campus: 'lipa', isActive: true };
const staff = { id: 'fac', displayName: 'Visible facilitator', email: 'fac@example.com', role: 'facilitator', campus: 'lipa', isActive: true };
const admin = { id: 'admin', displayName: 'Visible admin', email: 'admin@example.com', role: 'super_admin', campus: 'lipa', isActive: true };
const fixtureUrl = url(`
import React from ${JSON.stringify(import.meta.resolve('react'))};
export const state = { users: [], uid: 'PRIVATE_UID' };
export const userRepository = { getAll: async () => state.users, getById: async id => state.users.find(user => user.id === id) };
export const profileRepository = { getById: async () => ({ phone: 'PRIVATE_PHONE', bio: 'PRIVATE_BIO', institution: 'PRIVATE_INSTITUTION' }) };
export const adminService = {};
export const saveStudentProfile = async () => {};
export const listStudentOverrides = async () => [];
export const useAuth = () => ({ user: { uid: 'admin', role: 'super_admin' } });
export const useParams = () => ({ uid: state.uid });
export const Link = ({children}) => React.createElement('a', null, children);
export const CAMPUS_LABELS = { lipa: 'Lipa' };
export const ROLE_LABELS = { student: 'Student', facilitator: 'Facilitator', super_admin: 'Super Admin' };
export const ROLES = { STUDENT: 'student', FACILITATOR: 'facilitator', SUPER_ADMIN: 'super_admin' };
export const getErrorMessage = error => error.message;
export const Badge = ({children}) => React.createElement('span', null, children);
export const Card = ({children}) => React.createElement('section', null, children);
export const CardHeader = Card, CardBody = Card;
export const Button = ({children, onClick, disabled}) => React.createElement('button', {onClick, disabled}, children);
export const Input = ({label, ...props}) => React.createElement('input', {...props, 'aria-label':label});
export const EmptyState = ({title}) => React.createElement('p', null, title);
export const Spinner = () => null;
export const AssessmentOverrideDialog = () => null;
export const Modal = () => null;
export const ProfileSettingsForm = () => null;
`);
const fixture = await import(fixtureUrl);
function resolveBase(code) {
  return code.replace(/(['"])react\1/g, JSON.stringify(import.meta.resolve('react')))
    .replace(/(['"])react\/jsx-runtime\1/g, JSON.stringify(import.meta.resolve('react/jsx-runtime')));
}
const hookCode = resolveBase(compile(read('../src/hooks/useAdminUsers.ts')))
  .replace(/(['"])@spartan-g\/shared-services\1/g, JSON.stringify(fixtureUrl))
  .replace(/(['"])\.\.\/lib\/pseudonymization\1/g, JSON.stringify(policyUrl));
const hookUrl = url(hookCode);
const pageCode = resolveBase(compile(read('../src/pages/admin/AdminUsersPage.tsx')))
  .replace(/(['"])react-router-dom\1/g, JSON.stringify(import.meta.resolve('react-router-dom')))
  .replace(/(['"])\.\.\/\.\.\/hooks\/useAdminUsers\1/g, JSON.stringify(hookUrl))
  .replace(/from (['"])(?:@spartan-g\/shared-types|\.\.\/\.\.\/(?:hooks\/useAuth|components\/[^'"]+))\1/g, `from ${JSON.stringify(fixtureUrl)}`);
const { AdminUsersPage } = await import(url(pageCode));

test('student directory projection removes names/emails and keeps the same alias for details', () => {
  const projected = policy.adminUserListRows([rawStudent, staff]);
  assert.equal(projected[0].displayName, policy.adminStudentAlias(rawStudent.id));
  assert.equal(projected[0].email, 'Identity hidden');
  assert.equal(JSON.stringify(projected).includes('PRIVATE_NAME'), false);
  assert.equal(JSON.stringify(projected).includes('PRIVATE_EMAIL'), false);
  assert.equal(projected[1].displayName, staff.displayName);
});

test('role dropdown filters every role, preserves campus, and cannot search hidden student identity', async () => {
  fixture.state.users = [rawStudent, staff, admin];
  let root;
  try {
    await act(async () => { root = Renderer.create(React.createElement(MemoryRouter, {initialEntries:['/admin/users?campus=lipa'], future:{v7_startTransition:true,v7_relativeSplatPath:true}}, React.createElement(AdminUsersPage))); });
    const rendered = () => JSON.stringify(root.toJSON());
    assert.equal(rendered().includes('PRIVATE_NAME'), false);
    assert.equal(rendered().includes('PRIVATE_EMAIL'), false);
    const select = () => root.root.findByType('select');
    assert.deepEqual(select().findAllByType('option').map(option => option.props.value), ['all','student','facilitator','super_admin']);
    await act(async () => select().props.onChange({target:{value:'student'}}));
    assert.equal(rendered().includes('Visible facilitator'), false);
    assert.equal(rendered().includes('Visible admin'), false);
    assert.ok(rendered().includes(policy.adminStudentAlias(rawStudent.id)));
    await act(async () => root.root.findByType('input').props.onChange({target:{value:rawStudent.email}}));
    assert.ok(rendered().includes('No users found'));
    await act(async () => root.root.findByType('input').props.onChange({target:{value:''}}));
    await act(async () => select().props.onChange({target:{value:'super_admin'}}));
    assert.ok(rendered().includes('Visible admin'));
    assert.ok(rendered().includes('Campus: '));
  } finally { if(root) act(()=>root.unmount()); }
});

const detailCode = resolveBase(compile(read('../src/pages/admin/AdminUserDetailPage.tsx')))
  .replace(/(['"])react-router-dom\1/g, JSON.stringify(fixtureUrl))
  .replace(/(['"])\.\.\/\.\.\/lib\/pseudonymization\1/g, JSON.stringify(policyUrl))
  .replace(/from (['"])(?!react|data:|file:)[^'"]+\1/g, `from ${JSON.stringify(fixtureUrl)}`);
const { AdminUserDetailPage } = await import(url(detailCode));

test('student detail hides personal fields until explicitly revealed and can hide them again', async () => {
  fixture.state.users = [rawStudent];
  fixture.state.uid = rawStudent.id;
  let root;
  try {
    await act(async () => { root = Renderer.create(React.createElement(AdminUserDetailPage)); });
    const rendered = () => JSON.stringify(root.toJSON());
    for(const value of ['PRIVATE_NAME','PRIVATE_EMAIL','PRIVATE_PHONE','PRIVATE_BIO','PRIVATE_INSTITUTION']) assert.equal(rendered().includes(value), false);
    const reveal = () => root.root.findAllByType('button').find(button => JSON.stringify(button.props.children).includes('Reveal identity'));
    await act(async () => reveal().props.onClick());
    assert.ok(rendered().includes('PRIVATE_NAME'));
    assert.ok(rendered().includes('PRIVATE_EMAIL'));
    const hide = root.root.findAllByType('button').find(button => button.props.children === 'Hide identity');
    await act(async () => hide.props.onClick());
    assert.equal(rendered().includes('PRIVATE_NAME'), false);
    assert.equal(rendered().includes('PRIVATE_PHONE'), false);
  } finally { if(root) act(()=>root.unmount()); }
});
