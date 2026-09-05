/**
 * The AI Pass edge answers some requests itself, before the chat backend runs.
 *
 * A 403 from it is not the backend failing: the edge scores what a request
 * *contains*, so prose of one length passes where an agent-style prompt of the
 * same length is refused, and it answers in milliseconds rather than after the
 * model has thought. A shell path or an environment variable carried in the
 * prompt is reported to be enough on its own.
 *
 * That difference matters to the caller. A bad gateway invites a retry, and a
 * retry of the identical body reaches the identical verdict, so the proxy
 * reports a refusal as a request error the caller has to act on instead.
 *
 * The trigger set is undocumented and not ours to enumerate, so the proxy names
 * the shape of the problem and hands back the edge's own body as `detail`
 * rather than guessing which string was the one.
 */

const EDGE_REFUSAL_STATUS = 403;

/** The status the proxy answers with, since resending the same body cannot help. */
export const EDGE_REFUSAL_CLIENT_STATUS = 400;

export const EDGE_REFUSAL_HINT =
  "; the AI Pass edge refused this before the model ran, on what the prompt contains rather than how long it is — resending the same text will be refused again";

export const isEdgeRefusal = (status: number): boolean =>
  status === EDGE_REFUSAL_STATUS;
