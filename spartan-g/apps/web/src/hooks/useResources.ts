import { useCallback, useEffect, useState } from "react";
import type { ResourceDocument, Role } from "@spartan-g/shared-types";
import { resourceService } from "@spartan-g/shared-services";

type ResourceRow = ResourceDocument & { id: string };

/**
 * Loads resources for any portal from the SINGLE shared `resources`
 * collection:
 *  - `published` — Students/Facilitators (only isActive entries; rules enforce it)
 *  - `all`       — Super Admin management view (includes drafts)
 */
export function useResources(actorRole: Role | undefined, mode: "published" | "all") {
  const [resources, setResources] = useState<ResourceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const load = useCallback(async () => {
    if (!actorRole) return;
    setLoading(true);
    setError(null);
    try {
      const list =
        mode === "all"
          ? await resourceService.listAll(actorRole)
          : await resourceService.listPublished(actorRole);
      setResources(list);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, [actorRole, mode]);

  useEffect(() => {
    void load();
  }, [load]);

  return { resources, loading, error, reload: load };
}
