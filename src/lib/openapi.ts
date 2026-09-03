/**
 * The bits of an OpenAPI operation the plugin cannot derive from a route.
 *
 * `@elysiajs/openapi` reads the request body and the response models off each
 * route; what it cannot know is that a reply may come as an event stream
 * instead of JSON, or which error shape a status carries, so those are
 * declared in the route's `detail` with these helpers.
 */

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });

/** A JSON response of one registered model. */
export const json = (name: string, description: string) => ({
  content: { "application/json": { schema: ref(name) } },
  description,
});

/** A reply that is one registered model when buffered and a described event stream otherwise. */
export const jsonOrStream = (
  name: string,
  description: string,
  stream: string
) => ({
  content: {
    "application/json": { schema: ref(name) },
    "text/event-stream": { schema: { description: stream, type: "string" } },
  },
  description,
});
