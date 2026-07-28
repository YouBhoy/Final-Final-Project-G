import { COLLECTIONS } from '@spartan-g/shared-types';
import { getFirestoreDb, doc, getDoc, setDoc, Timestamp, serverTimestamp } from '../firebase/firestore';

const GEMINI_API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent';
const GEMINI_API_KEY_HEADER = 'x-goog-api-key';

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

class GeminiService {
  /**
   * Read the Gemini API key from environment variables.
   * Uses direct property access (process.env.EXPO_PUBLIC_*) which works for
   * both Expo/Metro (static replacement at build time) and Vite/web.
   * Falls back to the shared env config pattern for web.
   */
  private getApiKey(): string | null {
    try {
      // Direct property access — works for Expo/Metro and Vite
      return process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Generate an AI summary for assessment scores.
   * Returns null if the API call fails or the key is missing.
   * Non-blocking — caller should handle null gracefully.
   */
  async generateSummary(scores: AssessmentScores): Promise<string | null> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      console.warn('[GeminiService] No API key configured');
      return null;
    }

    const prompt = buildPrompt(scores);

    try {
      const response = await fetch(GEMINI_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          [GEMINI_API_KEY_HEADER]: apiKey,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 4096,
          },
          safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
          ],
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => 'Could not read error body');
        throw new Error(`Gemini API error (${response.status}): ${errorBody}`);
      }

      const data = await response.json();

      // Check for safety blocks
      if (!data.candidates || data.candidates.length === 0) {
        const blockReason = data?.promptFeedback?.blockReason;
        if (blockReason) {
          throw new Error(`Content was blocked by Gemini's safety filters (reason: ${blockReason}).`);
        }
        throw new Error('Gemini API returned no candidates.');
      }

      const candidate = data.candidates[0];
      const finishReason = candidate.finishReason;

      if (finishReason === 'SAFETY' || finishReason === 'BLOCKLIST') {
        const ratings = candidate.safetyRatings
          ?.filter((r: any) => r.probability !== 'NEGLIGIBLE')
          ?.map((r: any) => `${r.category}=${r.probability}`)
          ?.join(', ') || 'unknown categories';
        throw new Error(`Content was blocked by Gemini's safety filters (${ratings}).`);
      }

      const text = candidate?.content?.parts?.[0]?.text;

      if (!text || !text.trim()) {
        throw new Error(`Gemini API returned empty response (finishReason: ${finishReason || 'unknown'}).`);
      }

      let result = text.trim();

      // If truncated by token limit, trim to last complete sentence
      if (finishReason === 'MAX_TOKENS') {
        console.warn('[GeminiService] Response was truncated by token limit (finishReason: MAX_TOKENS).');
        const lastPeriod = result.lastIndexOf('.');
        if (lastPeriod > 0) {
          result = result.substring(0, lastPeriod + 1);
        }
      }

      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error('[GeminiService] Failed to generate summary:', message);
      throw err;
    }
  }

  /**
   * Check if a cached AI summary exists for an attempt.
   */
  async getCachedSummary(attemptId: string): Promise<string | null> {
    try {
      const db = getFirestoreDb();
      const docRef = doc(db, COLLECTIONS.ASSESSMENT_AI_SUMMARIES, attemptId);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        return docSnap.data()?.summary ?? null;
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Cache an AI summary for an attempt so it doesn't need to be regenerated.
   * Non-blocking — failures are logged but never thrown.
   */
  async cacheSummary(attemptId: string, summary: string): Promise<void> {
    try {
      const db = getFirestoreDb();
      const docRef = doc(db, COLLECTIONS.ASSESSMENT_AI_SUMMARIES, attemptId);
      await setDoc(docRef, {
        attemptId,
        summary,
        generatedAt: serverTimestamp() as Timestamp,
      });
    } catch (err) {
      console.error('[GeminiService] Failed to cache summary:', err);
    }
  }
}

export const geminiService = new GeminiService();