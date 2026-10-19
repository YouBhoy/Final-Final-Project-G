// Production metadata reads only. No Firestore document endpoint.
// getIamPolicy uses a POST read method, never setIamPolicy.
// OAuth refresh is in-memory; cached credentials are never rewritten or printed.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const docs = path.join(root, 'docs/garden-phase5');
const project = 'spartan-g-a2d80';
const expectedId = `projects/${project}/rulesets/8bbab4a7-a032-4c43-b399-43e0d98b5b19`;
const baselineHash = '8288af958b95b997a6b0bc9d8a707dde92e71318f2ece926bdf5321b5bf174e0';
const candidateHash = '4ec0f3c9bb399b9489c1d6ebf18f176ec81b9de3fbd20c3dee4fc5f370b7a5b1';
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const write = (name, value) => fs.writeFileSync(path.join(docs, name), typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
(async () => {
  fs.mkdirSync(docs, { recursive: true });
  const file = path.join(process.env.USERPROFILE, '.config/configstore/firebase-tools.json');
  const original = fs.readFileSync(file), login = JSON.parse(original);
  const response = await fetch('https://raw.githubusercontent.com/firebase/firebase-tools/master/src/api.ts', { signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error('Official CLI OAuth definition unavailable');
  const source = await response.text();
  const clientId = source.match(/"FIREBASE_CLIENT_ID",\s*"([^"]+)"/)?.[1];
  const clientSecret = source.match(/"FIREBASE_CLIENT_SECRET",\s*"([^"]+)"/)?.[1];
  if (!clientId || !clientSecret || !login.tokens?.refresh_token) throw new Error('Existing login unavailable');
  const refreshed = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: login.tokens.refresh_token, client_id: clientId, client_secret: clientSecret }), signal: AbortSignal.timeout(20000) });
  if (!refreshed.ok) throw new Error(`Existing login refresh: HTTP ${refreshed.status}`);
  const token = (await refreshed.json()).access_token;
  const requests = [];
  const allowed = [
    `https://firebaserules.googleapis.com/v1/projects/${project}/`,
    `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)`,
    `https://firebase.googleapis.com/v1beta1/projects/${project}`,
    `https://cloudresourcemanager.googleapis.com/v1/projects/${project}`,
    `https://cloudbilling.googleapis.com/v1/projects/${project}/billingInfo`,
    `https://cloudfunctions.googleapis.com/v1/projects/${project}/locations/-/functions`,
    `https://cloudfunctions.googleapis.com/v2/projects/${project}/locations/-/functions`,
    `https://iam.googleapis.com/v1/projects/${project}/serviceAccounts`,
  ];
  async function get(url, optional = false) {
    if (!allowed.some(prefix => url === prefix || (prefix.endsWith('/') && url.startsWith(prefix))) && !/^https:\/\/serviceusage\.googleapis\.com\/v1\/projects\/\d+\/services\?filter=state%3AENABLED&pageSize=200(?:&pageToken=[\w.%~-]+)?$/.test(url)) throw new Error('Unexpected metadata target');
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30000) });
    requests.push({ method: 'GET', url, status: r.status });
    if (!r.ok) { if (optional) return { unavailable: true, httpStatus: r.status }; throw new Error(`Metadata GET: HTTP ${r.status}`); }
    return r.json();
  }
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const database = await get(`https://firestore.googleapis.com/v1/projects/${project}/databases/(default)`);
  const endpoint = `https://firebaserules.googleapis.com/v1/projects/${project}/releases/cloud.firestore`;
  const release = await get(endpoint);
  const ruleset = await get(`https://firebaserules.googleapis.com/v1/${release.rulesetName}`);
  if (ruleset.source?.files?.length !== 1) throw new Error('Unexpected multi-file ruleset');
  const active = ruleset.source.files[0].content;
  const after = await get(endpoint);
  const result = { checkedAt: new Date().toISOString(), project, database: database.name, locationId: database.locationId, release, activeSha256: hash(active), candidateSha256: hash(fs.readFileSync(path.join(root, 'docs/sdk53-firestore-restoration/candidate.rules'))), stableDuringRead: release.rulesetName === after.rulesetName && release.updateTime === after.updateTime, credentialFileUnchanged: hash(original) === hash(fs.readFileSync(file)) };
  result.matchesExpected = result.database === `projects/${project}/databases/(default)` && release.rulesetName === expectedId && result.activeSha256 === baselineHash && result.candidateSha256 === candidateHash && result.stableDuringRead && result.credentialFileUnchanged;
  write(`active-${stamp}.rules`, active);
  write(`rules-verification-${stamp}.json`, { ...result, requests });
  console.log(JSON.stringify(result, null, 2));
  if (!result.matchesExpected) throw new Error('DEPLOYED RULE DRIFT: STOP. No rebase or deployment permitted.');
  if (!process.argv.includes('--infrastructure')) return;
  const projectInfo = await get(`https://cloudresourcemanager.googleapis.com/v1/projects/${project}`, true);
  const firebase = await get(`https://firebase.googleapis.com/v1beta1/projects/${project}`, true);
  const billing = await get(`https://cloudbilling.googleapis.com/v1/projects/${project}/billingInfo`, true);
  const v1 = await get(`https://cloudfunctions.googleapis.com/v1/projects/${project}/locations/-/functions`, true);
  const v2 = await get(`https://cloudfunctions.googleapis.com/v2/projects/${project}/locations/-/functions`, true);
  const accounts = await get(`https://iam.googleapis.com/v1/projects/${project}/serviceAccounts`, true);
  const policyUrl = `https://cloudresourcemanager.googleapis.com/v1/projects/${project}:getIamPolicy`;
  const policyResponse = await fetch(policyUrl, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ options: { requestedPolicyVersion: 3 } }), signal: AbortSignal.timeout(30000) });
  requests.push({ method: 'POST (read-only getIamPolicy)', url: policyUrl, status: policyResponse.status });
  const policy = policyResponse.ok ? await policyResponse.json() : null;
  const callerEmail = login.user?.email;
  const iam = policy ? { projectLevelOnly: true, callerDirectRoles: (policy.bindings || []).filter(b => b.members?.includes(`user:${callerEmail}`)).map(b => ({ role: b.role, conditional: !!b.condition })), serviceAccountBindings: (policy.bindings || []).map(b => ({ role: b.role, conditional: !!b.condition, members: (b.members || []).filter(m => m.startsWith('serviceAccount:')) })).filter(b => b.members.length), inheritedAndResourcePoliciesInspected: false } : { unavailable: true, httpStatus: policyResponse.status };
  const services = [];
  const number = projectInfo.projectNumber || firebase.projectNumber;
  if (number && /^\d+$/.test(String(number))) {
    let pageToken;
    do {
      const data = await get(`https://serviceusage.googleapis.com/v1/projects/${number}/services?filter=state%3AENABLED&pageSize=200${pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : ''}`, true);
      if (data.unavailable) { services.push(data); break; }
      services.push(...(data.services || []).map(s => ({ name: s.config?.name, state: s.state })));
      pageToken = data.nextPageToken;
    } while (pageToken);
  }
  // Omit member emails, billing-account identifier and any account keys.
  const summary = { checkedAt: new Date().toISOString(), project, projectNumber: number, projectState: projectInfo.lifecycleState, firebaseState: firebase.state, billing: billing.unavailable ? billing : { billingEnabled: billing.billingEnabled === true }, functionsV1: v1.unavailable ? v1 : { names: (v1.functions || []).map(f => f.name), unreachable: v1.unreachable || [], nextPageTokenPresent: !!v1.nextPageToken }, functionsV2: v2.unavailable ? v2 : { names: (v2.functions || []).map(f => f.name), unreachable: v2.unreachable || [], nextPageTokenPresent: !!v2.nextPageToken }, serviceAccounts: accounts.unavailable ? accounts : { names: (accounts.accounts || []).map(a => ({ name: a.name, disabled: !!a.disabled })), nextPageTokenPresent: !!accounts.nextPageToken }, enabledServices: services, iam, credentialFileUnchanged: hash(original) === hash(fs.readFileSync(file)), requests };
  write(`infrastructure-${stamp}.json`, summary);
  console.log(JSON.stringify(summary, null, 2));
})().catch(error => { console.error(error.message); process.exitCode = 1; });
