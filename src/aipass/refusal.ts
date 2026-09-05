/**
 * The AI Pass edge answers some requests itself with a 403 before the chat
 * backend runs, scoring what the prompt contains rather than its length. A
 * retry of the same body gets the same verdict, so the proxy reports it as a
 * request error and hands back the edge's own body, since the trigger set is
 * undocumented.
 */

const EDGE_REFUSAL_STATUS = 403;

export const EDGE_REFUSAL_CLIENT_STATUS = 400;

export const EDGE_REFUSAL_HINT =
  "; the AI Pass edge refused this before the model ran, on what the prompt contains rather than how long it is — resending the same text will be refused again";

export const isEdgeRefusal = (status: number): boolean =>
  status === EDGE_REFUSAL_STATUS;
