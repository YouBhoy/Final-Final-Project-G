import { getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { calculateDASS21Score, calculateGAD7Score, calculatePHQ9Score } from './assessmentScoring.js';

if (!getApps().length) initializeApp();

const geminiApiKey = defineSecret('GEMINI_API_KEY');

const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent';
const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 1000;
const REQUEST_TIMEOUT_MS = 60_000;

interface AssessmentScores {
  phqScore: number;
  phqSeverity: string;
  gadScore: number;
  gadSeverity: string;
  dassDepressionScore: number;
  dassDepressionSeverity: string;
  dassAnxietyScore: number;
  dassAnxietySeverity: string;
  dassStressScore: number;
  dassStressSeverity: string;
  overallRiskLevel: string;
  overallRiskScore: number;
}

export interface AssessmentSummaryResult {
  summary: string;
  cached: boolean;
}

function buildPrompt(scores: AssessmentScores): string {
  return `You are a clinical mental health screening assistant for guidance counselors.
You are given the results of a student's completed mental health screening
(PHQ-9, GAD-7, and DASS-21 assessments).

Your task is to produce a comprehensive, professional-grade, plain-language clinical summary
that a guidance counselor can use to understand the student's full results profile in depth.
Write as much as is needed to thoroughly cover every domain — aim for a detailed narrative.

STRUCTURE YOUR SUMMARY AS FOLLOWS (write a substantial paragraph for each section):

1. OVERVIEW: Start with a brief overall context paragraph stating which assessments were completed
   and the general clinical picture at a glance.

2. DOMAIN-BY-DOMAIN ANALYSIS: Write a detailed paragraph analyzing each score domain individually.
   For each domain — PHQ-9 (depression screening), GAD-7 (anxiety screening),
   DASS-21 Depression subscale, DASS-21 Anxiety subscale, DASS-21 Stress subscale —
   state the numeric score, the severity classification, and what this suggests clinically.
   Clearly distinguish which domains are elevated versus within normal/minimal range.
   Use specific score references throughout.

3. CROSS-DOMAIN PATTERNS: Write a paragraph identifying any notable patterns across domains.
   For example, if depression and anxiety are both elevated but stress is normal,
   or if all three DASS-21 subscales show similar elevation, discuss this pattern explicitly.

4. RISK CONTEXT: Write a paragraph contextualizing the overall risk score and risk level.
   Explain what the composite risk score means in the context of the individual domain results.

5. RECOMMENDATIONS: End with a practical, actionable paragraph of recommendations for the counselor,
   including suggested next steps and areas to explore in a follow-up conversation.

IMPORTANT CLINICAL RULES (these override all other instructions):
- Do NOT change, question, or re-interpret the numeric scores. They are already computed.
- Do NOT provide a DSM or ICD diagnosis. These are screening tools, not diagnostic instruments.
- Use neutral, professional, non-alarming language. Avoid words like "suffers from" or "afflicted."
- If scores are in the normal/minimal range, acknowledge that reassuringly.
- If scores are elevated, describe them factually without panic or alarm.
- Do not use bullet points or markdown formatting in the final output — write in fluent paragraph form.

Input data:
- PHQ-9 (depression screening): Score ${scores.phqScore}/27 — Severity: "${scores.phqSeverity}"
- GAD-7 (anxiety screening): Score ${scores.gadScore}/21 — Severity: "${scores.gadSeverity}"
- DASS-21 Depression subscale: Score ${scores.dassDepressionScore}/42 — Severity: "${scores.dassDepressionSeverity}"
- DASS-21 Anxiety subscale: Score ${scores.dassAnxietyScore}/42 — Severity: "${scores.dassAnxietySeverity}"
- DASS-21 Stress subscale: Score ${scores.dassStressScore}/42 — Severity: "${scores.dassStressSeverity}"
- Overall risk level: ${scores.overallRiskLevel}
- Overall risk score: ${scores.overallRiskScore}/100

Generate the comprehensive clinical summary now:`;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Raised for failures that are worth retrying (overloaded, rate limited, network). */
class TransientGeminiError extends Error {
  constructor(public readonly status: number | null) {
    super(`Gemini transient failure (${status ?? 'network'})`);
  }
}

async function requestGemini(apiKey: string, prompt: string): Promise<string> {
  let response: Response;
  try {
    response = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        // Default Gemini safety settings are intentionally left untouched.
        generationConfig: { temperature: 0.3, maxOutputTokens: 8192 },
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new TransientGeminiError(null);
  }

  if (response.status === 503 || response.status === 429) {
    throw new TransientGeminiError(response.status);
  }
  if (!response.ok) {
    // The body is logged server-side only and is never returned to the client.
    const body = await response.text().catch(() => '');
    console.error('[generateAssessmentSummary] Gemini error', response.status, body.slice(0, 500));
    throw new HttpsError('internal', 'The AI service returned an error. Please try again later.');
  }

  const data = (await response.json()) as {
    candidates?: Array<{
      finishReason?: string;
      content?: { parts?: Array<{ text?: string }> };
    }>;
    promptFeedback?: { blockReason?: string };
  };

  const candidate = data.candidates?.[0];
  if (!candidate) {
    const blockReason = data.promptFeedback?.blockReason;
    console.error('[generateAssessmentSummary] No candidates', blockReason ?? '');
    throw new HttpsError(
      'failed-precondition',
      blockReason
        ? 'The AI service declined to summarize this attempt. Please review the scores manually.'
        : 'The AI service returned no response. Please try again.',
    );
  }

  const finishReason = candidate.finishReason;
  if (finishReason && finishReason !== 'STOP' && finishReason !== 'MAX_TOKENS') {
    console.error('[generateAssessmentSummary] Blocked finishReason', finishReason);
    throw new HttpsError(
      'failed-precondition',
      'The AI service declined to summarize this attempt. Please review the scores manually.',
    );
  }

  let text = (candidate.content?.parts ?? []).map((p) => p.text ?? '').join('').trim();
  if (!text) {
    throw new HttpsError('failed-precondition', 'The AI service returned an empty summary. Please try again.');
  }

  // If truncated by the token limit, trim to the last complete sentence.
  if (finishReason === 'MAX_TOKENS') {
    const lastPeriod = text.lastIndexOf('.');
    if (lastPeriod > 0) text = text.substring(0, lastPeriod + 1);
  }
  return text;
}

async function generateWithRetry(apiKey: string, prompt: string): Promise<string> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      return await requestGemini(apiKey, prompt);
    } catch (err) {
      if (!(err instanceof TransientGeminiError)) throw err;
      if (attempt === MAX_ATTEMPTS) {
        throw new HttpsError(
          err.status === 429 ? 'resource-exhausted' : 'unavailable',
          'The AI service is busy right now. Please try again in a minute.',
        );
      }
      await sleep(BASE_BACKOFF_MS * 2 ** (attempt - 1));
    }
  }
  throw new HttpsError('internal', 'Unexpected summary failure.');
}

export const generateAssessmentSummary = onCall(
  { region: 'us-central1', cors: true, secrets: [geminiApiKey], timeoutSeconds: 120 },
  async (request): Promise<AssessmentSummaryResult> => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');

    const db = getFirestore();
    const caller = (await db.doc(`users/${uid}`).get()).data();
    if (!caller || caller.isActive !== true || !['facilitator', 'super_admin'].includes(caller.role)) {
      throw new HttpsError('permission-denied', 'Only facilitators and admins can generate summaries.');
    }

    const attemptId = request.data?.attemptId;
    if (typeof attemptId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(attemptId)) {
      throw new HttpsError('invalid-argument', 'A valid attempt id is required.');
    }
    const force = request.data?.force === true;

    const cacheRef = db.doc(`assessment_ai_summaries/${attemptId}`);
    if (!force) {
      const cached = (await cacheRef.get()).data();
      if (cached && typeof cached.summary === 'string' && cached.summary.trim()) {
        return { summary: cached.summary, cached: true };
      }
    }

    const attemptSnap = await db.doc(`assessment_attempts/${attemptId}`).get();
    if (!attemptSnap.exists) throw new HttpsError('not-found', 'Assessment attempt not found.');
    const attempt = attemptSnap.data() ?? {};
    if (attempt.status === 'in_progress') {
      throw new HttpsError('failed-precondition', 'This attempt has not been submitted yet.');
    }

    const answers: Record<string, string> = {};
    for (const a of Array.isArray(attempt.answers) ? attempt.answers : []) {
      if (a && typeof a.questionId === 'string') answers[a.questionId] = String(a.value ?? '');
    }
    const phq = calculatePHQ9Score(answers);
    const gad = calculateGAD7Score(answers);
    const dass = calculateDASS21Score(answers);
    const scores: AssessmentScores = {
      phqScore: phq.score,
      phqSeverity: phq.severity,
      gadScore: gad.score,
      gadSeverity: gad.severity,
      dassDepressionScore: dass.depression.score,
      dassDepressionSeverity: dass.depression.severity,
      dassAnxietyScore: dass.anxiety.score,
      dassAnxietySeverity: dass.anxiety.severity,
      dassStressScore: dass.stress.score,
      dassStressSeverity: dass.stress.severity,
      overallRiskLevel: typeof attempt.overallRiskLevel === 'string' ? attempt.overallRiskLevel : 'unknown',
      overallRiskScore: typeof attempt.overallRiskScore === 'number' ? attempt.overallRiskScore : 0,
    };

    const apiKey = geminiApiKey.value();
    if (!apiKey) {
      console.error('[generateAssessmentSummary] GEMINI_API_KEY secret is empty');
      throw new HttpsError('failed-precondition', 'AI summaries are not configured yet.');
    }

    const summary = await generateWithRetry(apiKey, buildPrompt(scores));

    await cacheRef.set({
      attemptId,
      summary,
      generatedAt: FieldValue.serverTimestamp(),
      generatedBy: uid,
    });

    return { summary, cached: false };
  },
);
