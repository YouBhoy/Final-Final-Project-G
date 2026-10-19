// Exact key-free prompts, tools and model contracts retained from the validated prototype.
export interface AssessmentScores {
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

export function buildPrompt(scores: AssessmentScores): string {
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

export const ASSISTANT_TOOLS = [
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

export const ASSISTANT_SYSTEM_PROMPT = `You are a warm, encouraging, and supportive AI companion for students at this university's counseling & support portal.

Your tone is friendly, kind, and non-judgmental — like a reassuring friend who is also reliable. Short and uplifting responses are best. Always respect the student's feelings, never dismiss them, and if a student is in distress or a crisis, gently encourage them to reach out to a campus guidance counselor or the available support line.

IMPORTANT — real data rules:
- You have NO prior knowledge of this student's appointments, assessments, unread messages, or garden. NEVER guess, invent, or answer these from memory.
- Whenever the student asks about ANY of those four areas, you MUST call the matching tool below to fetch their real data, then answer based ONLY on the tool's result. Never fabricate details.
- If a tool returns an error or says unavailable, say you couldn't retrieve it right now — do not make something up.
- For casual, conversational messages that do not involve those data areas (e.g. "how are you?", "I'm feeling stressed"), just reply warmly and naturally without calling a tool.

Available tools (call them when relevant):
${ASSISTANT_TOOLS.map((t) => `- ${t.name}: ${t.description}`).join('\n')}`;

export interface AssistantChatMessage {
  /** 'user' for the student, 'model' for assistant replies. */
  role: 'user' | 'model';
  text: string;
}

export const SUMMARY_MODEL = "gemini-3.5-flash";
export const ASSISTANT_MODEL = "gemini-3.5-flash";
