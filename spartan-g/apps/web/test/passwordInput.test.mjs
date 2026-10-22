import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

const source = readFileSync(new URL('../src/components/ui/Input.tsx', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React,
} }).outputText.replace(/from "react"/g, `from ${JSON.stringify(import.meta.resolve('react'))}`);
globalThis.React = React;
const { Input } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

test('password visibility changes the actual input type without altering its value or submitting', () => {
  let view;
  const password = ' test password ';
  act(() => { view = TestRenderer.create(React.createElement(Input, {
    label: 'Password', type: 'password', value: password, showPasswordToggle: true,
  })); });
  const field = () => view.root.findByType('input');
  const toggle = () => view.root.findByType('button');
  assert.equal(field().props.type, 'password');
  assert.equal(toggle().props.type, 'button');
  assert.notEqual(toggle().props.tabIndex, -1);
  act(() => toggle().props.onClick());
  assert.equal(field().props.type, 'text');
  assert.equal(field().props.value, password);
  assert.equal(toggle().props['aria-label'], 'Hide password');
  assert.equal(toggle().props['aria-pressed'], true);
  act(() => toggle().props.onClick());
  assert.equal(field().props.type, 'password');
  assert.equal(field().props.value, password);
  act(() => view.unmount());
});

test('disabled password input disables its visibility control', () => {
  let view;
  act(() => { view = TestRenderer.create(React.createElement(Input, {
    label: 'Password', type: 'password', disabled: true, showPasswordToggle: true,
  })); });
  assert.equal(view.root.findByType('button').props.disabled, true);
  act(() => view.unmount());
});
