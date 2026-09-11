import { COLLECTIONS } from '@spartan-g/shared-types';
import { getFirestoreDb, doc, getDoc, setDoc, Timestamp, serverTimestamp } from '../firebase/firestore';
import { appointmentRepository } from '../repositories/appointment.repository';
import { gardenRepository } from '../repositories/garden.repository';
import { assessmentService } from './assessment.service';
import { messagingService } from './messaging.service';
import { assistantUsageRepository } from '../repositories/assistant-usage.repository';

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

/* ─────────────────────────────────────────────────────────────────────────────
 * AI Student Assistant — fully INDEPENDENT client instance.
 *
 * This powers the hybrid companion bubble. It deliberately shares NOTHING with
 * the facilitator AI-summary flow above: its own URL constant, its own header,
 * its own API-key reader (EXPO_PUBLIC_GEMINI_ASSISTANT_API_KEY), its own
 * system prompt, and its own initialization. It never reads, references, or
 * falls back to EXPO_PUBLIC_GEMINI_API_KEY — if the assistant key is missing it
 * fails gracefully with its own explicit 'unconfigured' state instead.
 *
 * Tools only ever read the *currently authenticated student's own* data. The
 * studentId is captured by the caller (from the auth store) and passed through
 * to every tool closure; no tool accepts or derives an id from the model.
 * ───────────────────────────────────────────────────────────────────────────── */

/** Separate module-level constant — never shares the summary flow's URL. */
const GEMINI_ASSISTANT_API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent';
/** Separate header constant — never shares the summary flow's header const. */
const GEMINI_ASSISTANT_API_KEY_HEADER = 'x-goog-api-key';

/** Max assistant messages a student can send per day. */
const ASSISTANT_DAILY_LIMIT = 40;

/** Tool names the model is allowed to call — mirrors the executor switch below. */
const ASSISTANT_TOOLS = [
  {
    name: 'getAppointmentsThisWeek',
    description:
      "Returns the authenticated student's upcoming appointments within the next 7 days. Use whenever the student asks about their appointments, schedule, or meetings this week.",
    parameters: { type: 'OBJECT', properties: {} },
  },
  {
    name: 'getPendingAssessments',
    description:
      "Returns the authenticated student's pending / incomplete (in-progress) assessments. Use whenever the student asks what assessments they still need to finish or whether any are pending.",
    parameters: { type: 'OBJECT', properties: {} },
  },
  {
    name: 'getUnreadMessages',
    description:
      "Returns the authenticated student's total number of unread messages across all conversations. Use whenever the student asks about unread messages or new chats.",
    parameters: { type: 'OBJECT', properties: {} },
  },
  {
    name: 'getGardenStatus',
    description:
      "Returns the authenticated student's garden status (level, XP, seeds, streak). Use whenever the student asks about their garden, plant, XP, seeds, or streak.",
    parameters: { type: 'OBJECT', properties: {} },
  },
] as const;
const ASSISTANT_SYSTEM_PROMPT = `You are a warm, encouraging, and supportive AI companion for students at this university's counseling & support portal.

Your tone is friendly, kind, and non-judgmental — like a reassuring friend who is also reliable. Short and uplifting responses are best. Always respect the student's feelings, never dismiss them, and if a student is in distress or a crisis, gently encourage them to reach out to a campus guidance counselor or the available support line.

IMPORTANT — real data rules:
- You have NO prior knowledge of this student's appointments, assessments, unread messages, or garden. NEVER guess, invent, or answer these from memory.
- Whenever the student asks about ANY of those four areas, you MUST call the matching tool below to fetch their real data, then answer based ONLY on the tool's result. Never fabricate details.
- If a tool returns an error or says unavailable, say you couldn't retrieve it right now — do not make something up.
- For casual, conversational messages that do not involve those data areas (e.g. "how are you?", "I'm feeling stressed"), just reply warmly and naturally without calling a tool.

Available tools (call them when relevant):
${ASSISTANT_TOOLS.map((t) => `- ${t.name}: ${t.description}`).join('\n')}`;

/**
 * Result of an assistant turn. Distinct states so the UI can react specifically:
 *  - ok           → a text reply grounded in real data (or a casual reply).
 *  - daily_limit  → the student hit the daily cap; do not send to Gemini.
 *  - unconfigured → the assistant key is missing; NEVER borrow the summary key.
 *  - error        → the API call itself failed.
 */
export type AssistantChatResult =
  | { status: 'ok'; text: string; remaining: number }
  | { status: 'daily_limit'; remaining: number }
  | { status: 'unconfigured' }
  | { status: 'error'; message: string };

/** A single message in the multi-turn conversation history. */
export interface AssistantChatMessage {
  /** 'user' for the student, 'model' for assistant replies. */
  role: 'user' | 'model';
  text: string;
}

/** Local date bucket used to reset the daily counter at midnight. */
function localDateKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

class AssistantGeminiClient {
  /**
   * Reads the assistant key exclusively. This must NEVER return
   * EXPO_PUBLIC_GEMINI_API_KEY — the two features run independently.
   */
  private getApiKey(): string | null {
    try {
      return process.env.EXPO_PUBLIC_GEMINI_ASSISTANT_API_KEY ?? null;
    } catch {
      return null;
    }
  }

  /** Read the student's remaining messages today (before this turn). */
  async getRemaining(studentId: string): Promise<number> {
    try {
      const today = localDateKey();
      const usage = await assistantUsageRepository.getUsage(studentId);
      if (!usage) return ASSISTANT_DAILY_LIMIT;
      if (usage.date !== today) return ASSISTANT_DAILY_LIMIT;
      return Math.max(0, ASSISTANT_DAILY_LIMIT - usage.count);
    } catch {
      // On any read error, don't hard-block the student — return the full limit.
      return ASSISTANT_DAILY_LIMIT;
    }
  }

  /** Reserves one message (increments the counter), returning remaining. */
  private async consumeOne(studentId: string): Promise<number> {
    const today = localDateKey();
    try {
      const usage = await assistantUsageRepository.getUsage(studentId);
      if (!usage) {
        await assistantUsageRepository.createUsage(studentId, today, 1);
        return Math.max(0, ASSISTANT_DAILY_LIMIT - 1);
      }
      if (usage.date !== today) {
        await assistantUsageRepository.resetUsage(studentId, today);
        await assistantUsageRepository.incrementUsage(studentId, 1);
        return Math.max(0, ASSISTANT_DAILY_LIMIT - 1);
      }
      await assistantUsageRepository.incrementUsage(studentId, 1);
      return Math.max(0, ASSISTANT_DAILY_LIMIT - (usage.count + 1));
    } catch {
      // If we can't persist the counter, still allow the turn (fail-open) but
      // report remaining as the cap so the UI shows something sane.
      return ASSISTANT_DAILY_LIMIT;
    }
  }

  /* ── Tool executors — always the CURRENT student's own data, read-only ── */

  /** Upcoming appointments within the next 7 days. */
  private async toolAppointmentsThisWeek(studentId: string): Promise<unknown> {
    const now = Date.now();
    const in7d = now + 7 * 24 * 60 * 60 * 1000;
    const all = await appointmentRepository.getByStudent(studentId);
    const upcoming = all.filter((ap) => {
      const ms = ap.scheduledAt?.toDate?.().getTime?.() ?? new Date(ap.scheduledAt as any).getTime();
      return ms >= now && ms <= in7d;
    });
    return {
      count: upcoming.length,
      appointments: upcoming.map((ap) => {
        const ms = ap.scheduledAt?.toDate?.().getTime?.() ?? new Date(ap.scheduledAt as any).getTime();
        return {
          scheduledAt: new Date(ms).toISOString(),
          status: ap.status,
          notes: ap.notes ?? null,
        };
      }),
    };
  }

  /** Pending / in-progress assessments for the student. */
  private async toolPendingAssessments(studentId: string): Promise<unknown> {
    const attempts = await assessmentService.getInProgressAttemptsByStudent(studentId);
    return {
      count: attempts.length,
      assessmentIds: attempts.map((a) => a.assessmentId),
    };
  }

  /** Total unread messages across the student's conversations. */
  private async toolUnreadMessages(studentId: string): Promise<unknown> {
    const conversations = await messagingService.getConversations(studentId, 'student');
    const totalUnread = conversations.reduce(
      (sum, c) => sum + (c.unreadCount?.[studentId] ?? 0),
      0,
    );
    return { totalUnread };
  }

  /** Garden status for the student (pure read — never creates). */
  private async toolGardenStatus(studentId: string): Promise<unknown> {
    const garden = await gardenRepository.getGarden(studentId);
    if (!garden) {
      return { exists: false };
    }
    return {
      exists: true,
      level: garden.level,
      xp: garden.xp,
      seeds: garden.seeds,
      streakCount: garden.streakCount,
      lastCheckInDate: garden.lastCheckInDate,
    };
  }

  /** Dispatch a single tool call to the executor for the given student. */
  private async executeTool(name: string, studentId: string): Promise<string> {
    try {
      let result: unknown;
      switch (name) {
        case 'getAppointmentsThisWeek':
          result = await this.toolAppointmentsThisWeek(studentId);
          break;
        case 'getPendingAssessments':
          result = await this.toolPendingAssessments(studentId);
          break;
        case 'getUnreadMessages':
          result = await this.toolUnreadMessages(studentId);
          break;
        case 'getGardenStatus':
          result = await this.toolGardenStatus(studentId);
          break;
        default:
          result = { error: `Unknown tool: ${name}` };
      }
      return JSON.stringify(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return JSON.stringify({ error: message });
    }
  }

  /**
   * Send one turn to Gemini with tool definitions; if the model asks for a
   * tool, execute it, feed the real result back, and repeat until the model
   * returns natural-language text. Returns the final text.
   */
  private async runWithTools(
    apiKey: string,
    history: AssistantChatMessage[],
  ): Promise<string> {
    const contents: Array<{
      role: string;
      parts: Array<{ text?: string; functionResponse?: unknown }>;
    }> = history.map((m) => ({
      role: m.role === 'model' ? 'model' : 'user',
      parts: [{ text: m.text }],
    }));

    // Guard against an infinite tool loop.
    let safety = 0;
    const maxIterations = 6;

    while (safety < maxIterations) {
      safety += 1;

      const response = await fetch(GEMINI_ASSISTANT_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          [GEMINI_ASSISTANT_API_KEY_HEADER]: apiKey,
        },
        body: JSON.stringify({
          contents,
          systemInstruction: { parts: [{ text: ASSISTANT_SYSTEM_PROMPT }] },
          tools: [{ functionDeclarations: ASSISTANT_TOOLS }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 1024,
          },
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => 'Could not read error body');
        throw new Error(`Gemini API error (${response.status}): ${errorBody}`);
      }

      const data = await response.json();

      if (!data.candidates || data.candidates.length === 0) {
        throw new Error('Gemini API returned no candidates.');
      }

      const parts: any[] = data.candidates[0]?.content?.parts ?? [];

      // The model may request one or more tool calls.
      const toolCalls = parts.filter((p) => p?.functionCall?.name);

      if (toolCalls.length > 0) {
        for (const part of toolCalls) {
          const name = part.functionCall.name;
          // Tools are always executed for the caller-provided studentId,
          // never for any id the model might try to supply.
          const content = await this.executeTool(name, this._currentStudentId!);
          contents.push({
            role: 'user',
            parts: [
              {
                functionResponse: {
                  name,
                  response: { name, content },
                },
              },
            ],
          });
        }
        continue;
      }

      // Otherwise extract the natural-language text.
      const textParts = parts
        .map((p) => p?.text ?? '')
        .filter((t) => t && t.trim().length > 0);
      const text = textParts.join('\n').trim();
      if (text) return text;
      throw new Error('Gemini API returned an empty response.');
    }

    throw new Error('Assistant reached the maximum number of tool iterations.');
  }

  /**
   * The studentId that active-turn tool calls should read. Internal,
   * call-scoped state — never derived from the model, only from the auth store.
   */
  private _currentStudentId: string | null = null;

  /**
   * Ask the assistant a question. Grounds appointment/assessment/message/garden
   * answers in the student's real data via tool calls; casual messages get a
   * free natural reply.
   * @param message            The student's newest message.
   * @param studentId          The CURRENT authenticated student (auth store).
   * @param conversationHistory Prior turns in this conversation (latest last).
   */
  async chatWithAssistant(
    message: string,
    studentId: string,
    conversationHistory: AssistantChatMessage[] = [],
  ): Promise<AssistantChatResult> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      // Distinct, feature-specific failure — never borrow the summary key.
      return { status: 'unconfigured' };
    }

    const remaining = await this.getRemaining(studentId);
    if (remaining <= 0) {
      return { status: 'daily_limit', remaining: 0 };
    }

    // Reserve the message (increment the daily counter) only once we're about
    // to actually send it.
    await this.consumeOne(studentId);

    this._currentStudentId = studentId;

    try {
      const history: AssistantChatMessage[] = [
        ...conversationHistory,
        { role: 'user' as const, text: message },
      ];
      const text = await this.runWithTools(apiKey, history);
      const left = await this.getRemaining(studentId);
      return { status: 'ok', text, remaining: left };
    } catch (err) {
      const errMessage = err instanceof Error ? err.message : 'Unknown error';
      return { status: 'error', message: errMessage };
    } finally {
      this._currentStudentId = null;
    }
  }
}

/** The single, independent assistant client instance. */
export const assistantGeminiClient = new AssistantGeminiClient();