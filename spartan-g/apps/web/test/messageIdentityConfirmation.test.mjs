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
const fixtureUrl = url(`
import React from ${JSON.stringify(import.meta.resolve('react'))};
export const state = { user: { uid: 'student', role: 'student' }, sends: [], fail: false };
export const useAuth = () => ({ user: state.user });
export const Modal = ({open, title, children, onClose}) => open ? React.createElement('div', {role:'dialog'}, React.createElement('h2',null,title), children, React.createElement('button', {onClick:onClose}, 'Close')) : null;
export const MessageBubble = () => null;
export const messagingService = {
  subscribeToMessages: (_, __, next) => { next([]); return () => {}; },
  markConversationAsRead: async () => {}, markMessageAsRead: async () => {},
  sendMessage: async (...args) => { if(state.fail) throw new Error('offline'); state.sends.push(args); },
};
`);
const fixture = await import(fixtureUrl);
const hookCode = reactImports(compile(read('../src/hooks/useMessageIdentityConfirmation.tsx')))
  .replace(/from (['"])(?:\.\/useAuth|\.\.\/components\/ui\/Modal)\1/g, `from ${JSON.stringify(fixtureUrl)}`);
const inputUrl = url(reactImports(compile(read('../src/components/messaging/MessageInput.tsx'))));
const threadCode = reactImports(compile(read('../src/pages/messaging/MessageThread.tsx')))
  .replace(/(['"])\.\.\/\.\.\/hooks\/useMessageIdentityConfirmation\1/g, JSON.stringify(url(hookCode)))
  .replace(/(['"])\.\.\/\.\.\/components\/messaging\/MessageInput\1/g, JSON.stringify(inputUrl))
  .replace(/from (['"])(?:@spartan-g\/shared-services|\.\.\/\.\.\/hooks\/useAuth|\.\.\/\.\.\/components\/messaging\/MessageBubble)\1/g, `from ${JSON.stringify(fixtureUrl)}`);
const { MessageThread } = await import(url(threadCode));
async function setup(role = 'student') {
  fixture.state.user = { uid: role, role };
  fixture.state.sends = [];
  fixture.state.fail = false;
  let root;
  await act(async () => { root = Renderer.create(React.createElement(MessageThread, { conversationId:'conversation', participantId:'facilitator' })); });
  const input = () => root.root.findByType('input');
  const button = label => root.root.findAllByType('button').find(item => item.props.children === label);
  const type = async text => act(async () => input().props.onChange({target:{value:text}}));
  const submit = () => root.root.findByType('form').props.onSubmit({preventDefault(){}});
  return { root, input, button, type, submit };
}

test('canceling the disclosure popup sends nothing and preserves the student draft', async () => {
  const f = await setup();
  try {
    await f.type('Please help');
    let sending;
    await act(async () => { sending = f.submit(); });
    assert.equal(fixture.state.sends.length, 0);
    assert.ok(JSON.stringify(f.root.toJSON()).includes('will reveal your name and email'));
    await act(async () => { f.button('Cancel').props.onClick(); await sending; });
    assert.equal(fixture.state.sends.length, 0);
    assert.equal(f.input().props.value, 'Please help');
  } finally { act(()=>f.root.unmount()); }
});

test('confirmation sends to the selected facilitator with an atomic identity-sharing request', async () => {
  const f = await setup();
  try {
    await f.type('Please help');
    let sending;
    await act(async () => { sending = f.submit(); });
    await act(async () => { f.button('Continue and send').props.onClick(); await sending; });
    assert.deepEqual(fixture.state.sends[0], ['conversation','student','Please help','student',undefined,'facilitator']);
    assert.equal(f.input().props.value, '');
    await f.type('Follow-up');
    await act(async () => { await f.submit(); });
    assert.equal(fixture.state.sends.length, 2);
    assert.equal(f.root.root.findAllByProps({role:'dialog'}).length, 0);
  } finally { act(()=>f.root.unmount()); }
});

test('changing conversations dismisses the pending prompt without sending the old message', async () => {
  const f = await setup();
  try {
    await f.type('Unsent draft');
    let sending;
    await act(async () => { sending = f.submit(); });
    await act(async () => { f.root.update(React.createElement(MessageThread, {conversationId:'other',participantId:'other-fac'})); await sending; });
    assert.equal(fixture.state.sends.length, 0);
    assert.equal(f.root.root.findAllByProps({role:'dialog'}).length, 0);
  } finally { act(()=>f.root.unmount()); }
});

test('facilitator replies do not show the student disclosure popup', async () => {
  const f = await setup('facilitator');
  try {
    await f.type('Hello');
    await act(async () => { await f.submit(); });
    assert.equal(fixture.state.sends.length, 1);
    assert.equal(fixture.state.sends[0][5], undefined);
    assert.equal(f.root.root.findAllByProps({role:'dialog'}).length, 0);
  } finally { act(()=>f.root.unmount()); }
});
