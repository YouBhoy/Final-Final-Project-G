import { useCallback, useEffect, useRef, useState } from "react";
import { getFunctions, httpsCallable } from "firebase/functions";
import { app } from "../../firebase/firebase";
import { Button } from "../ui/Button";
import { Spinner } from "../ui/Spinner";

interface AiSummaryCardProps {
  attemptId: string;
}

interface SummaryResponse {
  summary: string;
  cached: boolean;
}

const FALLBACK_ERROR = "Couldn't generate the summary. Please try again.";

/** Turn a callable failure into a message that is safe to show a counselor. */
function friendlyError(err: unknown): string {
  const code = typeof err === "object" && err !== null && "code" in err ? String((err as { code: string }).code) : "";
  const message = typeof err === "object" && err !== null && "message" in err ? String((err as { message: string }).message) : "";

  if (code === "functions/not-found") {
    return "The AI summary service isn't available yet. Please contact an administrator.";
  }
  if (code === "functions/permission-denied") return "You don't have permission to generate summaries.";
  if (code === "functions/unauthenticated") return "Your session expired. Please sign in again.";
  // Server-supplied messages (unavailable, failed-precondition, ...) are already user-friendly.
  if (code.startsWith("functions/") && message && message.toLowerCase() !== "internal") return message;
  return FALLBACK_ERROR;
}

/**
 * AI-generated summary of one assessment attempt. The Cloud Function reads the
 * cache, loads the scores server-side and holds the Gemini key — this component
 * only sends the attempt id.
 */
export function AiSummaryCard({ attemptId }: AiSummaryCardProps) {
  const [summary, setSummary] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Bumped whenever the card unmounts or switches attempt, so stale responses are ignored.
  const generation = useRef(0);
  const inFlight = useRef(false);

  const load = useCallback(
    async (force: boolean) => {
      if (inFlight.current) return;
      inFlight.current = true;
      const current = generation.current;

      setIsLoading(true);
      setError(null);
      try {
        const callable = httpsCallable<{ attemptId: string; force: boolean }, SummaryResponse>(
          getFunctions(app),
          "generateAssessmentSummary",
          { timeout: 130_000 },
        );
        const result = await callable({ attemptId, force });
        if (current !== generation.current) return;
        setSummary(result.data.summary);
      } catch (err) {
        if (current !== generation.current) return;
        setError(friendlyError(err));
      } finally {
        if (current === generation.current) {
          inFlight.current = false;
          setIsLoading(false);
        }
      }
    },
    [attemptId],
  );

  // Keyed on the attempt id only.
  useEffect(() => {
    setSummary(null);
    void load(false);
    return () => {
      generation.current += 1;
      inFlight.current = false;
    };
  }, [load]);

  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50 p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-lg" aria-hidden="true">🤖</span>
          <h3 className="text-sm font-semibold text-violet-800">AI-Generated Summary</h3>
        </div>
        {summary && !isLoading && (
          <Button type="button" variant="outline" size="sm" onClick={() => void load(true)}>
            Regenerate
          </Button>
        )}
      </div>

      {isLoading ? (
        <div role="status" aria-live="polite" className="text-sm text-violet-700">
          <Spinner label={summary ? "Regenerating summary…" : "Generating summary…"} />
        </div>
      ) : error ? (
        <div role="alert" className="space-y-3">
          <p className="text-sm text-red-700">{error}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => void load(summary !== null)}>
            Retry
          </Button>
          {summary && <p className="whitespace-pre-line text-sm leading-relaxed text-gray-800">{summary}</p>}
        </div>
      ) : summary ? (
        <>
          <p className="whitespace-pre-line text-sm leading-relaxed text-gray-800">{summary}</p>
          <p className="mt-3 text-xs text-gray-500">
            This summary is AI-generated and is not a clinical diagnosis. It is a communication aid based on the
            computed scores above.
          </p>
        </>
      ) : (
        <p className="text-sm text-gray-600">No summary available for this attempt.</p>
      )}
    </div>
  );
}
