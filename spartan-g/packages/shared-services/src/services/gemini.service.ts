import { COLLECTIONS } from '@spartan-g/shared-types';
import { getFirestoreDb, doc, getDoc, setDoc, Timestamp, serverTimestamp } from '../firebase/firestore';

const GEMINI_API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

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
  return `You are a mental health screening assistant for guidance counselors.
You are given the results of a student's completed mental health screening
(PHQ-9, GAD-7, and DASS-21 assessments).

Your task is to produce a brief, plain-language summary (3-4 sentences)
that a guidance counselor can read quickly to understand the student's results.

IMPORTANT RULES:
- Do NOT change, question, or re-interpret the scores. They are already computed.
- Do NOT provide a diagnosis. These are screening tools, not diagnostic instruments.
- Use neutral, non-alarming language. Avoid words like "suffers from" or "afflicted."
- If scores are in the normal/minimal range, acknowledge that reassuringly.
- If scores are elevated, describe them factually without panic.
- End with a practical suggestion for the counselor (e.g., "A follow-up conversation may help explore these areas further.")

Input data:
- PHQ-9 (depression screening): Score ${scores.phqScore}/27 — Severity: "${scores.phqSeverity}"
- GAD-7 (anxiety screening): Score ${scores.gadScore}/21 — Severity: "${scores.gadSeverity}"
- DASS-21 Depression subscale: Score ${scores.dassDepressionScore}/42 — Severity: "${scores.dassDepressionSeverity}"
- DASS-21 Anxiety subscale: Score ${scores.dassAnxietyScore}/42 — Severity: "${scores.dassAnxietySeverity}"
- DASS-21 Stress subscale: Score ${scores.dassStressScore}/42 — Severity: "${scores.dassStressSeverity}"
- Overall risk level: ${scores.overallRiskLevel}
- Overall risk score: ${scores.overallRiskScore}/100

Generate the summary now:`;
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
      const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 300,
          },
        }),
      });

      if (!response.ok) {
        console.error('[GeminiService] API error:', response.status);
        return null;
      }

      const data = await response.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!text) {
        console.error('[GeminiService] Empty response from API');
        return null;
      }

      return text.trim();
    } catch (err) {
      console.error('[GeminiService] Failed to generate summary:', err);
      return null;
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