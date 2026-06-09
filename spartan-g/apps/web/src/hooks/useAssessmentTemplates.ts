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
import { COLLECTIONS, AssessmentTemplateDocument } from "@spartan-g/shared-types";

export type TemplateWithId = AssessmentTemplateDocument & { id: string };

interface State {
  data: TemplateWithId[];
  loading: boolean;
  error: Error | null;
}

/** Subscribe to all assessment templates (any active state). Admin-only use. */
export function useAllAssessmentTemplates(): State {
  const [state, setState] = useState<State>({ data: [], loading: true, error: null });

  useEffect(() => {
    const q = query(collection(db, COLLECTIONS.ASSESSMENT_TEMPLATES), orderBy("updatedAt", "desc"));
    const unsubscribe: Unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const items: TemplateWithId[] = snapshot.docs.map((d) => {
          const data = d.data() as Omit<AssessmentTemplateDocument, "id">;
          return { id: d.id, ...data };
        });
        setState({ data: items, loading: false, error: null });
      },
      (error) => setState({ data: [], loading: false, error }),
    );
    return unsubscribe;
  }, []);

  return state;
}

/** Subscribe to active assessment templates (visible to students). */
export function useActiveAssessmentTemplates(): State {
  const [state, setState] = useState<State>({ data: [], loading: true, error: null });

  useEffect(() => {
    const q = query(
      collection(db, COLLECTIONS.ASSESSMENT_TEMPLATES),
      where("isActive", "==", true),
      orderBy("title", "asc"),
    );
    const unsubscribe: Unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const items: TemplateWithId[] = snapshot.docs.map((d) => {
          const data = d.data() as Omit<AssessmentTemplateDocument, "id">;
          return { id: d.id, ...data };
        });
        setState({ data: items, loading: false, error: null });
      },
      (error) => setState({ data: [], loading: false, error }),
    );
    return unsubscribe;
  }, []);

  return state;
}
