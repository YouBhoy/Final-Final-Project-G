import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import React from 'react';
import Renderer, { act } from 'react-test-renderer';

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });
const config = { VITE_LOGIN_CAPTCHA_ENABLED: 'true', VITE_RECAPTCHA_SITE_KEY: 'test-site-key', VITE_CAPTCHA_VERIFY_URL: 'https://captcha.example/verify-captcha' };
async function load(env = config) {
  const source = readFileSync(new URL('../src/lib/loginCaptcha.ts', import.meta.url), 'utf8').replaceAll('import.meta.env', JSON.stringify(env));
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}#${Math.random()}`);
}

test('configured login requires a token before contacting the verifier', async () => {
  globalThis.fetch = () => { assert.fail('must not request'); };
  await assert.rejects((await load()).verifyLoginCaptcha(''), /complete the reCAPTCHA/);
});

test('successful verification sends only the token to the backend', async () => {
  globalThis.fetch = async (url, options) => {
    assert.equal(url, config.VITE_CAPTCHA_VERIFY_URL);
    assert.equal(options.method, 'POST');
    assert.deepEqual(JSON.parse(options.body), { token: 'captcha-token' });
    assert.equal(options.credentials, 'omit');
    return Response.json({ success: true });
  };
  await (await load()).verifyLoginCaptcha('captcha-token');
});

test('network, non-JSON, unsuccessful and non-boolean replies block login', async () => {
  for (const fetchImpl of [async () => { throw new Error('offline'); }, async () => new Response('bad'), async () => Response.json({ success: false }), async () => Response.json({ success: 'true' }), async () => Response.json({ success: true }, { status: 503 })]) {
    globalThis.fetch = fetchImpl;
    await assert.rejects((await load()).verifyLoginCaptcha('token'), /verification failed/);
  }
});

test('partial configuration fails closed; unconfigured development remains available', async () => {
  for (const env of [{ VITE_LOGIN_CAPTCHA_ENABLED: 'true' }, { VITE_RECAPTCHA_SITE_KEY: 'key' }]) {
    await assert.rejects((await load(env)).verifyLoginCaptcha('token'), /not configured/);
  }
  await (await load({})).verifyLoginCaptcha('');
});

test('local development bypasses configured reCAPTCHA while production remains configured', async () => {
  await (await load({ ...config, VITE_APP_ENV: 'development' })).verifyLoginCaptcha('');
  await assert.rejects((await load({ ...config, VITE_APP_ENV: 'production' })).verifyLoginCaptcha(''), /complete the reCAPTCHA/);
});

test('login form waits for verification, blocks failure, and resets the challenge for retry', async () => {
  const source = readFileSync(new URL('../src/pages/LoginPage.tsx', import.meta.url), 'utf8')
    .replace(/^import[\s\S]*?from ['"][^'"]+['"];?\r?\n/gm, '');
  const doubles = `
    import React, { useState } from ${JSON.stringify(import.meta.resolve('react'))};
    export const fixture = { logins: [], tokens: [], verify: async () => {} };
    const useAuth = () => ({ user: null, error: null, clearError() {}, login: async data => { fixture.logins.push(data); } });
    const loginCaptchaEnabled = true;
    const verifyLoginCaptcha = async token => { fixture.tokens.push(token); await fixture.verify(); };
    const PublicAuthLayout = ({ children }) => React.createElement('main', null, children);
    const Input = props => React.createElement('input', props);
    const Button = props => React.createElement('button', props);
    const Link = props => React.createElement('a', props);
    function LoginCaptcha() { return null; }
    const Navigate = () => null;
    const getRoleRedirect = () => '/student';
  `;
  const code = ts.transpileModule(doubles + source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText;
  const { LoginPage, fixture } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
  let root;
  try {
    await act(async () => { root = Renderer.create(React.createElement(LoginPage)); });
    const captcha = () => root.root.findByType('main').findAll(node => node.type.name === 'LoginCaptcha')[0];
    assert.equal(root.root.findByType('button').props.disabled, true);
    await act(async () => {
      const inputs = root.root.findAllByType('input');
      inputs[0].props.onChange({ target: { value: 'student@example.com' } });
      inputs[1].props.onChange({ target: { value: 'password' } });
      captcha().props.onToken('first-token');
    });
    let rejectVerification;
    fixture.verify = () => new Promise((resolve, reject) => { rejectVerification = reject; });
    let submission;
    await act(async () => { submission = root.root.findByType('form').props.onSubmit({ preventDefault() {} }); });
    assert.equal(fixture.logins.length, 0, 'Firebase must wait for server verification');
    await act(async () => { rejectVerification(new Error('verification rejected')); await submission; });
    assert.equal(fixture.logins.length, 0);
    assert.equal(root.root.findByType('button').props.disabled, true);
    assert.equal(captcha().props.resetCount, 1);
    fixture.verify = async () => {};
    await act(async () => { captcha().props.onToken('second-token'); });
    await act(async () => { await root.root.findByType('form').props.onSubmit({ preventDefault() {} }); });
    assert.deepEqual(fixture.logins, [{ email: 'student@example.com', password: 'password' }]);
    assert.deepEqual(fixture.tokens, ['first-token', 'second-token']);
    assert.equal(captcha().props.resetCount, 2);
  } finally {
    if (root) act(() => root.unmount());
  }
});
