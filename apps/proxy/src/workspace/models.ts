/**
 * Models served by Gemini Enterprise's Google workspace rather than AI Pass's
 * chat API. This list is the one place that decides a model goes there.
 */
export const WORKSPACE_MODELS = ["gemini-4-argon"] as const;

export type WorkspaceModel = (typeof WORKSPACE_MODELS)[number];

/** SAFETY: the predicate is the membership test, so the widening is what it checks. */
export const isWorkspaceModel = (id: string): id is WorkspaceModel =>
  (WORKSPACE_MODELS as readonly string[]).includes(id);
