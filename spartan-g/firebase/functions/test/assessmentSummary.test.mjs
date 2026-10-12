import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildPrompt, requestGemini } from '../lib/assessmentSummary.js';

const scores = {
  phqScore: 3, phqSeverity: 'Minimal depression', gadScore: 2, gadSeverity: 'Minimal anxiety',
  dassDepressionScore: 2, dassDepressionSeverity: 'Normal', dassAnxietyScore: 0, dassAnxietySeverity: 'Normal',
  dassStressScore: 4, dassStressSeverity: 'Normal', overallRiskLevel: 'low', overallRiskScore: 8,
};
test('website prompt matches the app branch assessment-summary prompt', () => {
  const mobileTemplate = readFileSync(new URL('fixtures/mobile-summary-prompt.txt', import.meta.url), 'utf8').trimEnd();
  const web = readFileSync(new URL('../src/assessmentSummary.ts', import.meta.url), 'utf8');
  const template = source => source.match(/function buildPrompt\([\s\S]*?return `([\s\S]*?)`;/)[1].replace(/\r\n/g, '\n');
  assert.equal(template(web), mobileTemplate);
  assert.match(buildPrompt(scores), /PHQ-9/);
});
async function withResponse(status, body, callback) {
  const original = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    assert.match(url, /gemini-3\.5-flash:generateContent$/);
    assert.equal(options.headers['x-goog-api-key'], 'synthetic-test-key');
    const payload = JSON.parse(options.body);
    assert.deepEqual(payload.generationConfig, { temperature: 0.3, maxOutputTokens: 4096 });
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  };
  try { await callback(); } finally { globalThis.fetch = original; }
}
test('successful summaries collect text parts and preserve complete sentences on truncation', async () => {
  await withResponse(200, { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'First. ' }, { text: 'Second.' }] } }] }, async () => {
    assert.equal(await requestGemini('synthetic-test-key', buildPrompt(scores)), 'First. Second.');
  });
  await withResponse(200, { candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: 'Complete sentence. Unfinished' }] } }] }, async () => {
    assert.equal(await requestGemini('synthetic-test-key', buildPrompt(scores)), 'Complete sentence.');
  });
});
test('credential/model failures and blocked or empty output produce actionable errors', async () => {
  for (const status of [401, 403, 404]) await withResponse(status, { error: { message: 'Do not expose provider details' } }, async () => {
    await assert.rejects(requestGemini('synthetic-test-key', buildPrompt(scores)), { code: 'failed-precondition' });
  });
  for (const body of [{ promptFeedback: { blockReason: 'SAFETY' } }, { candidates: [{ finishReason: 'SAFETY' }] }, { candidates: [{ finishReason: 'STOP' }] }]) {
    await withResponse(200, body, async () => {
      await assert.rejects(requestGemini('synthetic-test-key', buildPrompt(scores)), { code: 'failed-precondition' });
    });
  }
});
