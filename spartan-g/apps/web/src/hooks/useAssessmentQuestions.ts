import { useEffect, useState } from "react";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "../firebase/firebase";
import {
  COLLECTIONS,
  AssessmentQuestionDocument,
} from "@spartan-g/shared-types";

export type QuestionWithId = AssessmentQuestionDocument & { id: string };

interface State {
  data: QuestionWithId[];
  loading: boolean;
  error: Error | null;
}

/** Subscribe to all questions for a given template, ordered by `order`. */
export function useAssessmentQuestions(templateId: string | null): State {
  const [state, setState] = useState<State>({ data: [], loading: !!templateId, error: null });

  useEffect(() => {
    if (!templateId) {
      setState({ data: [], loading: false, error: null });
      return;
    }
    const q = query(
      collection(db, COLLECTIONS.ASSESSMENT_QUESTIONS),
      where("templateId", "==", templateId),
      orderBy("order", "asc"),
    );
    const unsubscribe: Unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const items: QuestionWithId[] = snapshot.docs.map((d) => {
          const data = d.data() as Omit<AssessmentQuestionDocument, "id">;
          return { id: d.id, ...data };
        });
        setState({ data: items, loading: false, error: null });
      },
      (error) => setState({ data: [], loading: false, error }),
    );
    return unsubscribe;
  }, [templateId]);

  return state;
}
