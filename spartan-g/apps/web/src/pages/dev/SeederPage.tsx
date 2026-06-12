import { useState } from "react";
import { db } from "../../firebase/firebase";
import { doc, setDoc } from "firebase/firestore";

const ASSESSMENT_ID = "rJNot7eBFTElrRXvj1GG";

const assessmentData = {
  courseId: "mental-health-screening",
  title: "Student Mental Health Assessment",
  description:
    "A combined PHQ-9, DASS-21, and GAD-7 screening to monitor and evaluate student psychological health.",
  instructions:
    "Please answer each question honestly based on how you have been feeling over the past 2 weeks. There are no right or wrong answers. Your responses are confidential.",
  maxAttempts: 10,
  isPublished: true,
  facilitatorId: "test-facilitator",
  passingScore: 0,
  timeLimitMinutes: 20,
  questions: [
    {
      id: "phq1",
      type: "multiple_choice",
      text: "PHQ-9 (1/9): Little interest or pleasure in doing things?",
      order: 0,
      points: 3,
      options: [
        { id: "0", label: "Not at all" },
        { id: "1", label: "Several days" },
        { id: "2", label: "More than half the days" },
        { id: "3", label: "Nearly every day" },
      ],
    },
    {
      id: "phq2",
      type: "multiple_choice",
      text: "PHQ-9 (2/9): Feeling down, depressed, or hopeless?",
      order: 1,
      points: 3,
      options: [
        { id: "0", label: "Not at all" },
        { id: "1", label: "Several days" },
        { id: "2", label: "More than half the days" },
        { id: "3", label: "Nearly every day" },
      ],
    },
    {
      id: "phq3",
      type: "multiple_choice",
      text: "PHQ-9 (3/9): Trouble falling or staying asleep, or sleeping too much?",
      order: 2,
      points: 3,
      options: [
        { id: "0", label: "Not at all" },
        { id: "1", label: "Several days" },
        { id: "2", label: "More than half the days" },
        { id: "3", label: "Nearly every day" },
      ],
    },
    {
      id: "phq4",
      type: "multiple_choice",
      text: "PHQ-9 (4/9): Feeling tired or having little energy?",
      order: 3,
      points: 3,
      options: [
        { id: "0", label: "Not at all" },
        { id: "1", label: "Several days" },
        { id: "2", label: "More than half the days" },
        { id: "3", label: "Nearly every day" },
      ],
    },
    {
      id: "phq5",
      type: "multiple_choice",
      text: "PHQ-9 (5/9): Poor appetite or overeating?",
      order: 4,
      points: 3,
      options: [
        { id: "0", label: "Not at all" },
        { id: "1", label: "Several days" },
        { id: "2", label: "More than half the days" },
        { id: "3", label: "Nearly every day" },
      ],
    },
    {
      id: "phq6",
      type: "multiple_choice",
      text: "PHQ-9 (6/9): Feeling bad about yourself — or that you are a failure or have let yourself or your family down?",
      order: 5,
      points: 3,
      options: [
        { id: "0", label: "Not at all" },
        { id: "1", label: "Several days" },
        { id: "2", label: "More than half the days" },
        { id: "3", label: "Nearly every day" },
      ],
    },
    {
      id: "phq7",
      type: "multiple_choice",
      text: "PHQ-9 (7/9): Trouble concentrating on things, such as reading the newspaper or watching television?",
      order: 6,
      points: 3,
      options: [
        { id: "0", label: "Not at all" },
        { id: "1", label: "Several days" },
        { id: "2", label: "More than half the days" },
        { id: "3", label: "Nearly every day" },
      ],
    },
    {
      id: "phq8",
      type: "multiple_choice",
      text: "PHQ-9 (8/9): Moving or speaking so slowly that other people could have noticed? Or being so fidgety or restless that you moved around more than usual?",
      order: 7,
      points: 3,
      options: [
        { id: "0", label: "Not at all" },
        { id: "1", label: "Several days" },
        { id: "2", label: "More than half the days" },
        { id: "3", label: "Nearly every day" },
      ],
    },
    {
      id: "phq9",
      type: "multiple_choice",
      text: "PHQ-9 (9/9): Thoughts that you would be better off dead, or of hurting yourself in some way?",
      order: 8,
      points: 3,
      options: [
        { id: "0", label: "Not at all" },
        { id: "1", label: "Several days" },
        { id: "2", label: "More than half the days" },
        { id: "3", label: "Nearly every day" },
      ],
    },
    {
      id: "gad1",
      type: "multiple_choice",
      text: "GAD-7 (1/7): Feeling nervous, anxious, or on edge?",
      order: 9,
      points: 3,
      options: [
        { id: "0", label: "Not at all" },
        { id: "1", label: "Several days" },
        { id: "2", label: "More than half the days" },
        { id: "3", label: "Nearly every day" },
      ],
    },
    {
      id: "gad2",
      type: "multiple_choice",
      text: "GAD-7 (2/7): Not being able to stop or control worrying?",
      order: 10,
      points: 3,
      options: [
        { id: "0", label: "Not at all" },
        { id: "1", label: "Several days" },
        { id: "2", label: "More than half the days" },
        { id: "3", label: "Nearly every day" },
      ],
    },
    {
      id: "gad3",
      type: "multiple_choice",
      text: "GAD-7 (3/7): Worrying too much about different things?",
      order: 11,
      points: 3,
      options: [
        { id: "0", label: "Not at all" },
        { id: "1", label: "Several days" },
        { id: "2", label: "More than half the days" },
        { id: "3", label: "Nearly every day" },
      ],
    },
    {
      id: "gad4",
      type: "multiple_choice",
      text: "GAD-7 (4/7): Trouble relaxing?",
      order: 12,
      points: 3,
      options: [
        { id: "0", label: "Not at all" },
        { id: "1", label: "Several days" },
        { id: "2", label: "More than half the days" },
        { id: "3", label: "Nearly every day" },
      ],
    },
    {
      id: "gad5",
      type: "multiple_choice",
      text: "GAD-7 (5/7): Being so restless that it is hard to sit still?",
      order: 13,
      points: 3,
      options: [
        { id: "0", label: "Not at all" },
        { id: "1", label: "Several days" },
        { id: "2", label: "More than half the days" },
        { id: "3", label: "Nearly every day" },
      ],
    },
    {
      id: "gad6",
      type: "multiple_choice",
      text: "GAD-7 (6/7): Becoming easily annoyed or irritable?",
      order: 14,
      points: 3,
      options: [
        { id: "0", label: "Not at all" },
        { id: "1", label: "Several days" },
        { id: "2", label: "More than half the days" },
        { id: "3", label: "Nearly every day" },
      ],
    },
    {
      id: "gad7",
      type: "multiple_choice",
      text: "GAD-7 (7/7): Feeling afraid, as if something awful might happen?",
      order: 15,
      points: 3,
      options: [
        { id: "0", label: "Not at all" },
        { id: "1", label: "Several days" },
        { id: "2", label: "More than half the days" },
        { id: "3", label: "Nearly every day" },
      ],
    },
    {
      id: "dass1",
      type: "multiple_choice",
      text: "DASS-21 (1/21): I found it hard to wind down.",
      order: 16,
      points: 3,
      options: [
        { id: "0", label: "Did not apply to me at all" },
        { id: "1", label: "Applied to me to some degree" },
        { id: "2", label: "Applied to me to a considerable degree" },
        { id: "3", label: "Applied to me very much" },
      ],
    },
    {
      id: "dass2",
      type: "multiple_choice",
      text: "DASS-21 (2/21): I was aware of dryness of my mouth.",
      order: 17,
      points: 3,
      options: [
        { id: "0", label: "Did not apply to me at all" },
        { id: "1", label: "Applied to me to some degree" },
        { id: "2", label: "Applied to me to a considerable degree" },
        { id: "3", label: "Applied to me very much" },
      ],
    },
    {
      id: "dass3",
      type: "multiple_choice",
      text: "DASS-21 (3/21): I couldn't seem to experience any positive feeling at all.",
      order: 18,
      points: 3,
      options: [
        { id: "0", label: "Did not apply to me at all" },
        { id: "1", label: "Applied to me to some degree" },
        { id: "2", label: "Applied to me to a considerable degree" },
        { id: "3", label: "Applied to me very much" },
      ],
    },
    {
      id: "dass4",
      type: "multiple_choice",
      text: "DASS-21 (4/21): I experienced breathing difficulty (e.g. excessively rapid breathing, breathlessness in the absence of physical exertion).",
      order: 19,
      points: 3,
      options: [
        { id: "0", label: "Did not apply to me at all" },
        { id: "1", label: "Applied to me to some degree" },
        { id: "2", label: "Applied to me to a considerable degree" },
        { id: "3", label: "Applied to me very much" },
      ],
    },
    {
      id: "dass5",
      type: "multiple_choice",
      text: "DASS-21 (5/21): I found it difficult to work up the initiative to do things.",
      order: 20,
      points: 3,
      options: [
        { id: "0", label: "Did not apply to me at all" },
        { id: "1", label: "Applied to me to some degree" },
        { id: "2", label: "Applied to me to a considerable degree" },
        { id: "3", label: "Applied to me very much" },
      ],
    },
    {
      id: "dass6",
      type: "multiple_choice",
      text: "DASS-21 (6/21): I tended to over-react to situations.",
      order: 21,
      points: 3,
      options: [
        { id: "0", label: "Did not apply to me at all" },
        { id: "1", label: "Applied to me to some degree" },
        { id: "2", label: "Applied to me to a considerable degree" },
        { id: "3", label: "Applied to me very much" },
      ],
    },
    {
      id: "dass7",
      type: "multiple_choice",
      text: "DASS-21 (7/21): I experienced trembling (e.g. in the hands).",
      order: 22,
      points: 3,
      options: [
        { id: "0", label: "Did not apply to me at all" },
        { id: "1", label: "Applied to me to some degree" },
        { id: "2", label: "Applied to me to a considerable degree" },
        { id: "3", label: "Applied to me very much" },
      ],
    },
    {
      id: "dass8",
      type: "multiple_choice",
      text: "DASS-21 (8/21): I felt that I was using a lot of nervous energy.",
      order: 23,
      points: 3,
      options: [
        { id: "0", label: "Did not apply to me at all" },
        { id: "1", label: "Applied to me to some degree" },
        { id: "2", label: "Applied to me to a considerable degree" },
        { id: "3", label: "Applied to me very much" },
      ],
    },
    {
      id: "dass9",
      type: "multiple_choice",
      text: "DASS-21 (9/21): I was worried about situations in which I might panic and make a fool of myself.",
      order: 24,
      points: 3,
      options: [
        { id: "0", label: "Did not apply to me at all" },
        { id: "1", label: "Applied to me to some degree" },
        { id: "2", label: "Applied to me to a considerable degree" },
        { id: "3", label: "Applied to me very much" },
      ],
    },
    {
      id: "dass10",
      type: "multiple_choice",
      text: "DASS-21 (10/21): I felt that I had nothing to look forward to.",
      order: 25,
      points: 3,
      options: [
        { id: "0", label: "Did not apply to me at all" },
        { id: "1", label: "Applied to me to some degree" },
        { id: "2", label: "Applied to me to a considerable degree" },
        { id: "3", label: "Applied to me very much" },
      ],
    },
    {
      id: "dass11",
      type: "multiple_choice",
      text: "DASS-21 (11/21): I found myself getting agitated.",
      order: 26,
      points: 3,
      options: [
        { id: "0", label: "Did not apply to me at all" },
        { id: "1", label: "Applied to me to some degree" },
        { id: "2", label: "Applied to me to a considerable degree" },
        { id: "3", label: "Applied to me very much" },
      ],
    },
    {
      id: "dass12",
      type: "multiple_choice",
      text: "DASS-21 (12/21): I found it difficult to relax.",
      order: 27,
      points: 3,
      options: [
        { id: "0", label: "Did not apply to me at all" },
        { id: "1", label: "Applied to me to some degree" },
        { id: "2", label: "Applied to me to a considerable degree" },
        { id: "3", label: "Applied to me very much" },
      ],
    },
    {
      id: "dass13",
      type: "multiple_choice",
      text: "DASS-21 (13/21): I felt down-hearted and blue.",
      order: 28,
      points: 3,
      options: [
        { id: "0", label: "Did not apply to me at all" },
        { id: "1", label: "Applied to me to some degree" },
        { id: "2", label: "Applied to me to a considerable degree" },
        { id: "3", label: "Applied to me very much" },
      ],
    },
    {
      id: "dass14",
      type: "multiple_choice",
      text: "DASS-21 (14/21): I was intolerant of anything that kept me from getting on with what I was doing.",
      order: 29,
      points: 3,
      options: [
        { id: "0", label: "Did not apply to me at all" },
        { id: "1", label: "Applied to me to some degree" },
        { id: "2", label: "Applied to me to a considerable degree" },
        { id: "3", label: "Applied to me very much" },
      ],
    },
    {
      id: "dass15",
      type: "multiple_choice",
      text: "DASS-21 (15/21): I felt I was close to panic.",
      order: 30,
      points: 3,
      options: [
        { id: "0", label: "Did not apply to me at all" },
        { id: "1", label: "Applied to me to some degree" },
        { id: "2", label: "Applied to me to a considerable degree" },
        { id: "3", label: "Applied to me very much" },
      ],
    },
    {
      id: "dass16",
      type: "multiple_choice",
      text: "DASS-21 (16/21): I was unable to become enthusiastic about anything.",
      order: 31,
      points: 3,
      options: [
        { id: "0", label: "Did not apply to me at all" },
        { id: "1", label: "Applied to me to some degree" },
        { id: "2", label: "Applied to me to a considerable degree" },
        { id: "3", label: "Applied to me very much" },
      ],
    },
    {
      id: "dass17",
      type: "multiple_choice",
      text: "DASS-21 (17/21): I felt I wasn't worth much as a person.",
      order: 32,
      points: 3,
      options: [
        { id: "0", label: "Did not apply to me at all" },
        { id: "1", label: "Applied to me to some degree" },
        { id: "2", label: "Applied to me to a considerable degree" },
        { id: "3", label: "Applied to me very much" },
      ],
    },
    {
      id: "dass18",
      type: "multiple_choice",
      text: "DASS-21 (18/21): I felt that I was rather touchy.",
      order: 33,
      points: 3,
      options: [
        { id: "0", label: "Did not apply to me at all" },
        { id: "1", label: "Applied to me to some degree" },
        { id: "2", label: "Applied to me to a considerable degree" },
        { id: "3", label: "Applied to me very much" },
      ],
    },
    {
      id: "dass19",
      type: "multiple_choice",
      text: "DASS-21 (19/21): I was aware of the action of my heart in the absence of physical exertion (e.g. sense of heart rate increase, irregular heartbeat).",
      order: 34,
      points: 3,
      options: [
        { id: "0", label: "Did not apply to me at all" },
        { id: "1", label: "Applied to me to some degree" },
        { id: "2", label: "Applied to me to a considerable degree" },
        { id: "3", label: "Applied to me very much" },
      ],
    },
    {
      id: "dass20",
      type: "multiple_choice",
      text: "DASS-21 (20/21): I felt scared without any good reason.",
      order: 35,
      points: 3,
      options: [
        { id: "0", label: "Did not apply to me at all" },
        { id: "1", label: "Applied to me to some degree" },
        { id: "2", label: "Applied to me to a considerable degree" },
        { id: "3", label: "Applied to me very much" },
      ],
    },
    {
      id: "dass21",
      type: "multiple_choice",
      text: "DASS-21 (21/21): I felt that life was meaningless.",
      order: 36,
      points: 3,
      options: [
        { id: "0", label: "Did not apply to me at all" },
        { id: "1", label: "Applied to me to some degree" },
        { id: "2", label: "Applied to me to a considerable degree" },
        { id: "3", label: "Applied to me very much" },
      ],
    },
  ],
};

export function SeederPage() {
  const [status, setStatus] = useState<
    "idle" | "seeding" | "success" | "error"
  >("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSeed() {
    setStatus("seeding");
    setErrorMessage(null);

    try {
      const docRef = doc(db, "assessments", ASSESSMENT_ID);
      await setDoc(docRef, assessmentData);
      setStatus("success");
    } catch (err) {
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : "Unknown error");
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="rounded-xl border border-gray-200 bg-white p-12 shadow-sm text-center max-w-md">
        <h1 className="text-xl font-semibold text-gray-900 mb-2">
          Assessment Seeder
        </h1>
        <p className="text-sm text-gray-500 mb-6">
          Seed the "Student Mental Health Assessment" document into Firestore
          with ID <code className="text-indigo-600 font-mono">{ASSESSMENT_ID}</code>
        </p>

        <button
          onClick={handleSeed}
          disabled={status === "seeding"}
          className="rounded-lg bg-indigo-600 px-6 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {status === "seeding" ? "Seeding..." : "Seed Assessment"}
        </button>

        {status === "success" && (
          <p className="mt-4 text-sm text-green-600 font-medium">
            Assessment seeded successfully!
          </p>
        )}

        {status === "error" && (
          <p className="mt-4 text-sm text-red-600 font-medium">
            Error: {errorMessage}
          </p>
        )}
      </div>
    </div>
  );
}