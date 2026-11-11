import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
function evaluate(source, overrides = {}) {
  const result = { exports: {} };
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function('module', 'exports', 'require', code)(result, result.exports, name => Object.hasOwn(overrides, name) ? overrides[name] : require(name));
  return result.exports;
}
const metadata = evaluate(read('../src/lib/androidDownload.ts'));
const components = evaluate(read('../src/components/download/AndroidDownloadSection.tsx'), { '../../lib/androidDownload': metadata, '../../styles/android-download.css': {} });
const page = evaluate(read('../src/pages/DownloadPage.tsx'), { '../lib/androidDownload': metadata, '../components/download/AndroidDownloadSection': components, '../styles/public-pages.css': {}, '../styles/android-download.css': {} });
const render = component => renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(component)));

test('release links and checksum identify the exact approved v34 APK', () => {
  assert.equal(metadata.ANDROID_DOWNLOAD_PAGE, 'https://spartan-g-a2d80.web.app/download');
  assert.equal(metadata.ANDROID_RELEASE.url, 'https://drive.google.com/file/d/1nMaBy-ZUFjgkrw6Pxr1Awdnm807NLJgW/view?usp=sharing');
  assert.equal(metadata.ANDROID_RELEASE.sha256, 'ea34092f03653ec1ca88a248533ea58404b39e79f88e68cf7018dacc6ac7cfb1');
  assert.equal(metadata.ANDROID_RELEASE.version, '1.0.0 (34)');
  assert.equal(metadata.ANDROID_RELEASE.applicationId, 'com.spartang.mobile');
});
test('download action opens only the reviewed Drive URL with safe external navigation', () => {
  const html = render(components.AndroidDownloadButton);
  assert.ok(html.includes('href="' + metadata.ANDROID_RELEASE.url.replaceAll('&', '&amp;') + '"'));
  assert.ok(html.includes('target="_blank"') && html.includes('rel="noopener noreferrer"'));
  assert.ok(html.includes('opens Google Drive in a new tab'));
  assert.ok(!html.includes('download="')); // Drive serves a review page, not a same-origin file.
});
test('download page renders independently with version, checksum, sideload disclosure and preservation instructions', () => {
  const html = render(page.DownloadPage);
  for (const value of [metadata.ANDROID_RELEASE.version, metadata.ANDROID_RELEASE.sha256, metadata.ANDROID_RELEASE.filename, 'outside Google Play', 'keep your app data', 'do not need to uninstall', 'Skip to content']) assert.ok(html.includes(value), value);
  assert.ok(html.includes('href="/login"') && html.includes('href="/"'));
});
test('landing section provides both the APK action and the public installation-guide route', () => {
  const html = render(components.AndroidDownloadSection);
  assert.ok(html.includes('Take ') && html.includes('SPARTAN-G</span>') && html.includes('Anywhere.'));
  assert.ok(html.includes('href="/download"') && html.includes(metadata.ANDROID_RELEASE.url));
});
test('QR link uses the permanent production URL and a locally served image', () => {
  const html = render(page.DownloadPage);
  assert.ok(html.includes('href="' + metadata.ANDROID_DOWNLOAD_PAGE + '"'));
  assert.ok(html.includes('src="/android-download-qr.svg"'));
  assert.ok(!html.includes('api.qrserver') && !html.includes('chart.googleapis'));
});
test('approved mascot bytes are reused without a mobile-source or APK dependency', () => {
  const actual = createHash('sha256').update(readFileSync(new URL('../public/red-spartan-wave.png', import.meta.url))).digest('hex');
  assert.equal(actual, 'e104f657341e87b149025340527a0a09d1ce88c4e289e31d07bab74659382a05');
});

const routerSource = read('../src/navigation/AppRouter.tsx');
const parsed = ts.createSourceFile('AppRouter.tsx', routerSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const gate = parsed.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'AuthGate');
function authGate(path, status, child) {
  const prefix = `const useLocation = () => ({pathname:${JSON.stringify(path)}}); const useAuth = () => ({status:${JSON.stringify(status)}}); const LoadingScreen = () => null; const PrivacyConsentGate = () => null; const PrivacyDashboardBackground = () => null;`;
  return evaluate(prefix + '\nexport ' + gate.getText(parsed)).AuthGate({ children: child });
}
for (const path of ['/download', '/download/']) for (const status of ['idle', 'loading', 'unauthenticated', 'authenticated']) test('public download is reachable during ' + status + ': ' + path, () => {
  const child = React.createElement('div', null, 'Public download');
  assert.equal(authGate(path, status, child).props.children, child);
});
for (const path of ['/student/messages', '/admin/users', '/facilitator/dashboard', '/download/private', '/download-admin']) test('public-route exception cannot bypass protected path ' + path, () => {
  const child = React.createElement('div', null, 'Protected');
  assert.equal(authGate(path, 'loading', child).type.name, 'LoadingScreen');
  assert.equal(authGate(path, 'authenticated', child).type.name, 'PrivacyConsentGate');
});
test('download route and landing insertion do not replace existing login or resource navigation', () => {
  assert.ok(routerSource.includes('<Route path="/download" element={<DownloadPage />} />'));
  const landing = read('../src/pages/LandingPage.tsx');
  assert.ok(landing.includes('<AndroidDownloadSection />'));
  assert.ok(landing.includes('transitionToLogin') && landing.includes('privacyDialog') && landing.includes('usePublicResources'));
});
